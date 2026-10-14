// Dashboard: which dashboards someone sees, and copy-on-write. A person has
// no rows until they first change something; until then they see their
// role's default set (HR-made), else the built-in layout. Their first edit
// copies whatever they were seeing into their own rows, so later changes to
// the role default don't touch them (and "Reset to default" deletes their
// copy to follow the default again).

import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { CATALOG, DEFAULT_LAYOUT, catalogRoles } from "./catalog";
import { WIDGET_SIZES, widgetSpecSchema } from "./spec";

export type WidgetRecord = {
  id: string;
  title: string;
  builtinKey: string | null;
  spec: unknown;
  width: number;
  height: number;
};

export type DashboardRecord = {
  id: string;
  name: string;
  widgets: WidgetRecord[];
};

/** Whose dashboards: a person's own, or HR's default for a role. */
export type DashboardScope = { kind: "user"; userId: string; role: Role } | { kind: "role"; role: Role };

/** Where the dashboards shown came from. */
export type DashboardOrigin = "own" | "role-default" | "built-in";

const BUILT_IN_ID = "built-in";

const WIDGETS_IN_ORDER = {
  widgets: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.DashboardInclude;

function toRecord(row: Prisma.DashboardGetPayload<{ include: typeof WIDGETS_IN_ORDER }>): DashboardRecord {
  return {
    id: row.id,
    name: row.name,
    widgets: row.widgets.map((widget) => ({
      id: widget.id,
      title: widget.title,
      builtinKey: widget.builtinKey,
      spec: widget.spec,
      width: widget.width,
      height: widget.height,
    })),
  };
}

/** Today's dashboard as widgets, minus what `role` can't see. */
export function builtInDashboards(role: Role): DashboardRecord[] {
  const widgets = DEFAULT_LAYOUT.flatMap((id) => {
    const entry = CATALOG.find((candidate) => candidate.id === id);
    if (!entry || !catalogRoles(entry).includes(role)) return [];
    const size = WIDGET_SIZES[entry.size];
    return [
      {
        id: `${BUILT_IN_ID}:${entry.id}`,
        title: entry.title,
        builtinKey: entry.builtinKey ?? null,
        spec: entry.spec ? widgetSpecSchema.parse(entry.spec) : null,
        width: size.width,
        height: size.height,
      },
    ];
  });
  return [{ id: BUILT_IN_ID, name: "Overview", widgets }];
}

async function roleDefaults(role: Role): Promise<DashboardRecord[]> {
  const rows = await db.dashboard.findMany({
    where: { role, ownerId: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: WIDGETS_IN_ORDER,
  });
  return rows.map(toRecord);
}

/** The dashboards a scope sees now, and where they came from. */
export async function dashboardsFor(scope: DashboardScope): Promise<{ dashboards: DashboardRecord[]; origin: DashboardOrigin }> {
  if (scope.kind === "user") {
    const own = await db.dashboard.findMany({
      where: { ownerId: scope.userId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: WIDGETS_IN_ORDER,
    });
    if (own.length) return { dashboards: own.map(toRecord), origin: "own" };
  }
  const defaults = await roleDefaults(scope.role);
  if (defaults.length) return { dashboards: defaults, origin: "role-default" };
  return { dashboards: builtInDashboards(scope.role), origin: "built-in" };
}

const scopeWhere = (scope: DashboardScope): Prisma.DashboardWhereInput =>
  scope.kind === "user" ? { ownerId: scope.userId } : { role: scope.role, ownerId: null };

/**
 * Makes sure the scope has its own rows (copying what it sees now), and
 * returns them. The copy keeps names, order and sizes, so nothing moves.
 */
export async function materialize(scope: DashboardScope): Promise<DashboardRecord[]> {
  const { dashboards, origin } = await dashboardsFor(scope);
  const owned = scope.kind === "user" ? origin === "own" : origin === "role-default";
  if (owned) return dashboards;
  await db.$transaction(async (tx) => {
    // Another tab may have copied first.
    if (await tx.dashboard.count({ where: scopeWhere(scope) })) return;
    for (const [position, dashboard] of dashboards.entries()) {
      await tx.dashboard.create({
        data: {
          ...(scope.kind === "user" ? { ownerId: scope.userId } : { role: scope.role }),
          name: dashboard.name,
          position,
          widgets: {
            create: dashboard.widgets.map((widget, widgetPosition) => ({
              title: widget.title,
              builtinKey: widget.builtinKey,
              spec: (widget.spec ?? undefined) as Prisma.InputJsonValue | undefined,
              width: widget.width,
              height: widget.height,
              position: widgetPosition,
            })),
          },
        },
      });
    }
  });
  return (await dashboardsFor(scope)).dashboards;
}

/** Dashboards colleagues shared with this person, with who shared them. */
export async function sharedWith(userId: string): Promise<(DashboardRecord & { sharedBy: string })[]> {
  const shares = await db.dashboardShare.findMany({
    where: { userId, dashboard: { ownerId: { not: null } } },
    orderBy: { createdAt: "asc" },
    include: {
      dashboard: {
        include: { ...WIDGETS_IN_ORDER, owner: { select: { name: true, email: true, employee: { select: { name: true } } } } },
      },
    },
  });
  return shares.map((share) => ({
    ...toRecord(share.dashboard),
    sharedBy: share.dashboard.owner?.employee?.name ?? share.dashboard.owner?.name ?? "A colleague",
  }));
}

/**
 * A dashboard the user may change: their own, or (HR) a role default.
 * Null otherwise, including shared dashboards (read-only).
 */
export async function editableDashboard(user: { id: string; role: Role }, dashboardId: string) {
  const dashboard = await db.dashboard.findUnique({
    where: { id: dashboardId },
    select: { id: true, ownerId: true, role: true },
  });
  if (!dashboard) return null;
  if (dashboard.ownerId === user.id) return dashboard;
  if (!dashboard.ownerId && dashboard.role && user.role === "HR_ADMIN") return dashboard;
  return null;
}
