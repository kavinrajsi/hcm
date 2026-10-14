"use server";

// Dashboard (home page) changes. Everyone can arrange their own dashboards;
// HR can also edit the default set for each role and add custom widgets to
// the catalogue. Every action re-checks that the dashboard is the caller's
// own (or, for HR, a role default); shared dashboards are read-only.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireRole, requireUser, type SessionUser } from "@/lib/rbac";
import { CATALOG, catalogRoles } from "@/lib/dashboard/catalog";
import { runWidget, type WidgetResult } from "@/lib/dashboard/run";
import { SOURCES, canUseSource, type Option } from "@/lib/dashboard/sources";
import { WIDGET_SIZES, defaultSize, widgetSpecSchema, type WidgetSize } from "@/lib/dashboard/spec";
import { editableDashboard, materialize, type DashboardScope } from "@/lib/dashboard/store";
import { viewerFor } from "@/lib/dashboard/viewer";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const done = (id?: string): ActionResult => {
  revalidatePath("/");
  return { ok: true, id };
};

const roleSchema = z.enum(Role);
const nameSchema = z.string().trim().min(1, "Give it a name").max(60, "Keep the name under 60 characters");
const titleSchema = z.string().trim().min(1, "Give the widget a title").max(80, "Keep the title under 80 characters");
const sizeSchema = z.enum(Object.keys(WIDGET_SIZES) as [WidgetSize, ...WidgetSize[]]);

/** The user's own scope, or (HR only) a role's defaults. */
async function scopeFor(user: SessionUser, role: string | null | undefined): Promise<DashboardScope> {
  if (!role) return { kind: "user", userId: user.id, role: user.role };
  if (user.role !== "HR_ADMIN") throw new Error("Only HR can change role defaults");
  return { kind: "role", role: roleSchema.parse(role) };
}

function editUrl(role: string | null | undefined, tab?: string) {
  const query = new URLSearchParams({ edit: "1" });
  if (role) query.set("defaults", role);
  if (tab) query.set("tab", tab);
  return `/?${query}`;
}

/** "Customise": copy what the scope sees into its own rows, then edit. */
export async function startEditing(formData: FormData) {
  const user = await requireUser();
  const role = (formData.get("defaults") as string | null) || null;
  const tab = (formData.get("tab") as string | null) || "";
  const dashboards = await materialize(await scopeFor(user, role));
  // The tab id may have been a built-in placeholder; keep its position.
  const index = Math.max(0, Number(formData.get("tabIndex") ?? 0));
  const tabId = dashboards.find((dashboard) => dashboard.id === tab)?.id ?? dashboards[index]?.id ?? dashboards[0]?.id;
  revalidatePath("/");
  redirect(editUrl(role, tabId));
}

/** Drop the user's own dashboards and follow their role's default again. */
export async function resetToDefault(formData: FormData) {
  const user = await requireUser();
  const role = (formData.get("defaults") as string | null) || null;
  const scope = await scopeFor(user, role);
  await db.dashboard.deleteMany({
    where: scope.kind === "user" ? { ownerId: user.id } : { role: scope.role, ownerId: null },
  });
  revalidatePath("/");
  redirect(role ? `/?defaults=${role}` : "/");
}

export async function createDashboard(input: { name: string; defaults?: string | null }): Promise<ActionResult> {
  const user = await requireUser();
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return fail(name.error.issues[0].message);
  const scope = await scopeFor(user, input.defaults);
  const existing = await materialize(scope);
  if (existing.length >= 12) return fail("You can have up to 12 dashboards.");
  const dashboard = await db.dashboard.create({
    data: {
      ...(scope.kind === "user" ? { ownerId: user.id } : { role: scope.role }),
      name: name.data,
      position: existing.length,
    },
  });
  return done(dashboard.id);
}

export async function renameDashboard(id: string, name: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (!(await editableDashboard(user, id))) return fail("You can't change this dashboard.");
  await db.dashboard.update({ where: { id }, data: { name: parsed.data } });
  return done(id);
}

export async function deleteDashboard(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const dashboard = await editableDashboard(user, id);
  if (!dashboard) return fail("You can't change this dashboard.");
  const siblings = await db.dashboard.count({
    where: dashboard.ownerId ? { ownerId: dashboard.ownerId } : { role: dashboard.role, ownerId: null },
  });
  if (siblings <= 1) return fail("Keep at least one dashboard.");
  await db.dashboard.delete({ where: { id } });
  return done();
}

/** Moves a tab one place left (-1) or right (+1). */
export async function moveDashboard(id: string, direction: -1 | 1): Promise<ActionResult> {
  const user = await requireUser();
  const dashboard = await editableDashboard(user, id);
  if (!dashboard) return fail("You can't change this dashboard.");
  const siblings = await db.dashboard.findMany({
    where: dashboard.ownerId ? { ownerId: dashboard.ownerId } : { role: dashboard.role, ownerId: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const ids = siblings.map((sibling) => sibling.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (to < 0 || to >= ids.length) return done(id);
  [ids[from], ids[to]] = [ids[to], ids[from]];
  await db.$transaction(ids.map((dashboardId, position) => db.dashboard.update({ where: { id: dashboardId }, data: { position } })));
  return done(id);
}

const addSchema = z.union([
  z.object({ catalogId: z.string().max(60) }),
  z.object({ catalogWidgetId: z.string().max(40) }),
  z.object({ title: titleSchema, spec: widgetSpecSchema, size: sizeSchema.optional() }),
]);

export async function addWidget(dashboardId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const dashboard = await editableDashboard(user, dashboardId);
  if (!dashboard) return fail("You can't change this dashboard.");
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the widget's settings.");
  // Role defaults are for that role; personal dashboards for the user.
  const forRole = dashboard.role ?? user.role;

  let data: { title: string; builtinKey?: string; spec?: Prisma.InputJsonValue; size: WidgetSize };
  if ("catalogId" in parsed.data) {
    const entry = CATALOG.find((candidate) => candidate.id === (parsed.data as { catalogId: string }).catalogId);
    if (!entry || !catalogRoles(entry).includes(forRole)) return fail("That widget isn't available.");
    data = {
      title: entry.title,
      builtinKey: entry.builtinKey,
      spec: entry.spec ? (widgetSpecSchema.parse(entry.spec) as Prisma.InputJsonValue) : undefined,
      size: entry.size,
    };
  } else if ("catalogWidgetId" in parsed.data) {
    const entry = await db.dashboardCatalogWidget.findUnique({ where: { id: parsed.data.catalogWidgetId } });
    const spec = entry && widgetSpecSchema.safeParse(entry.spec);
    if (!entry || !spec?.success || !canUseSource(SOURCES[spec.data.source], forRole)) return fail("That widget isn't available.");
    const size = (Object.keys(WIDGET_SIZES) as WidgetSize[]).find(
      (key) => WIDGET_SIZES[key].width === entry.width && WIDGET_SIZES[key].height === entry.height,
    );
    data = { title: entry.title, spec: spec.data as Prisma.InputJsonValue, size: size ?? "medium" };
  } else {
    const { title, spec, size } = parsed.data;
    if (!canUseSource(SOURCES[spec.source], forRole)) return fail("That data isn't available for this role.");
    data = { title, spec: spec as Prisma.InputJsonValue, size: size ?? defaultSize(spec.chart) };
  }
  const last = await db.dashboardWidget.aggregate({ where: { dashboardId }, _max: { position: true } });
  const widget = await db.dashboardWidget.create({
    data: {
      dashboardId,
      title: data.title,
      builtinKey: data.builtinKey ?? null,
      spec: data.spec,
      width: WIDGET_SIZES[data.size].width,
      height: WIDGET_SIZES[data.size].height,
      position: (last._max.position ?? -1) + 1,
    },
  });
  return done(widget.id);
}

/** The widget plus a check that the caller may change its dashboard. */
async function editableWidget(user: SessionUser, widgetId: string) {
  const widget = await db.dashboardWidget.findUnique({ where: { id: widgetId } });
  if (!widget) return null;
  const dashboard = await editableDashboard(user, widget.dashboardId);
  return dashboard ? { widget, dashboard } : null;
}

export async function updateWidget(widgetId: string, input: { title: string; spec: unknown }): Promise<ActionResult> {
  const user = await requireUser();
  const found = await editableWidget(user, widgetId);
  if (!found) return fail("You can't change this widget.");
  if (found.widget.builtinKey) return fail("Built-in widgets can't be edited; add a new one instead.");
  const title = titleSchema.safeParse(input.title);
  if (!title.success) return fail(title.error.issues[0].message);
  const spec = widgetSpecSchema.safeParse(input.spec);
  if (!spec.success) return fail("Check the widget's settings.");
  if (!canUseSource(SOURCES[spec.data.source], found.dashboard.role ?? user.role)) return fail("That data isn't available for this role.");
  await db.dashboardWidget.update({
    where: { id: widgetId },
    data: { title: title.data, spec: spec.data as Prisma.InputJsonValue },
  });
  return done(widgetId);
}

export async function resizeWidget(widgetId: string, size: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = sizeSchema.safeParse(size);
  if (!parsed.success) return fail("Unknown size.");
  if (!(await editableWidget(user, widgetId))) return fail("You can't change this widget.");
  const { width, height } = WIDGET_SIZES[parsed.data];
  await db.dashboardWidget.update({ where: { id: widgetId }, data: { width, height } });
  return done(widgetId);
}

export async function removeWidget(widgetId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await editableWidget(user, widgetId))) return fail("You can't change this widget.");
  await db.dashboardWidget.delete({ where: { id: widgetId } });
  return done();
}

/** Saves the order after a drag; ids not on this dashboard are ignored. */
export async function reorderWidgets(dashboardId: string, widgetIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await editableDashboard(user, dashboardId))) return fail("You can't change this dashboard.");
  const ids = z.array(z.string().max(40)).max(200).parse(widgetIds);
  const existing = new Set(
    (await db.dashboardWidget.findMany({ where: { dashboardId }, select: { id: true } })).map((widget) => widget.id),
  );
  await db.$transaction(
    ids
      .filter((id) => existing.has(id))
      .map((id, position) => db.dashboardWidget.update({ where: { id }, data: { position } })),
  );
  return done();
}

/** Who can see a personal dashboard (read-only, with their own access). */
export async function setShares(dashboardId: string, userIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const dashboard = await editableDashboard(user, dashboardId);
  if (!dashboard || dashboard.ownerId !== user.id) return fail("Only your own dashboards can be shared.");
  const ids = [...new Set(z.array(z.string().max(40)).max(100).parse(userIds))].filter((id) => id !== user.id);
  const valid = await db.user.findMany({ where: { id: { in: ids }, disabledAt: null }, select: { id: true } });
  await db.$transaction([
    db.dashboardShare.deleteMany({ where: { dashboardId, userId: { notIn: valid.map((row) => row.id) } } }),
    db.dashboardShare.createMany({
      data: valid.map((row) => ({ dashboardId, userId: row.id })),
      skipDuplicates: true,
    }),
  ]);
  return done(dashboardId);
}

/** People a dashboard can be shared with (names only), and who has it now. */
export async function shareOptions(dashboardId: string): Promise<{ people: Option[]; sharedWith: string[] }> {
  const user = await requireUser();
  const dashboard = await editableDashboard(user, dashboardId);
  if (!dashboard || dashboard.ownerId !== user.id) return { people: [], sharedWith: [] };
  const [users, shares] = await Promise.all([
    db.user.findMany({
      where: { disabledAt: null, id: { not: user.id } },
      select: { id: true, name: true, email: true, employee: { select: { name: true } } },
    }),
    db.dashboardShare.findMany({ where: { dashboardId }, select: { userId: true } }),
  ]);
  return {
    people: users
      .map((person) => ({ value: person.id, label: person.employee?.name ?? person.name ?? person.email.split("@")[0] }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    sharedWith: shares.map((share) => share.userId),
  };
}

/** HR: put a custom widget in the catalogue for everyone. */
export async function publishWidget(widgetId: string, description: string): Promise<ActionResult> {
  const user = await requireRole("HR_ADMIN");
  const widget = await db.dashboardWidget.findUnique({ where: { id: widgetId } });
  const spec = widget && widgetSpecSchema.safeParse(widget.spec);
  if (!widget || !spec?.success) return fail("Only custom widgets can be added to the catalogue.");
  const entry = await db.dashboardCatalogWidget.create({
    data: {
      title: widget.title,
      description: description.trim().slice(0, 200) || null,
      spec: spec.data as Prisma.InputJsonValue,
      width: widget.width,
      height: widget.height,
      createdById: user.id,
    },
  });
  return done(entry.id);
}

export async function removeCatalogWidget(id: string): Promise<ActionResult> {
  await requireRole("HR_ADMIN");
  await db.dashboardCatalogWidget.deleteMany({ where: { id } });
  return done();
}

/** The builder's live preview, run as the caller. */
export async function previewWidget(spec: unknown): Promise<WidgetResult> {
  const user = await requireUser();
  return runWidget(spec, await viewerFor(user));
}

/** A field's values for the builder's filter picker, scoped to the caller. */
export async function fieldOptions(sourceKey: string, fieldKey: string): Promise<Option[]> {
  const user = await requireUser();
  const source = SOURCES[sourceKey as keyof typeof SOURCES];
  if (!source || !canUseSource(source, user.role)) return [];
  const field = source.fields.find((candidate) => candidate.key === fieldKey);
  if (!field) return [];
  if (field.labels) return Object.entries(field.labels).map(([value, label]) => ({ value, label }));
  return field.options ? (await field.options(await viewerFor(user))).slice(0, 300) : [];
}
