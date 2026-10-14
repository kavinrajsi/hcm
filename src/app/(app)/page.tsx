import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { PageHeader, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import type { Role } from "@/generated/prisma/enums";
import { loadBuiltins } from "@/lib/dashboard/builtins";
import { CATALOG, catalogRoles } from "@/lib/dashboard/catalog";
import { canOpen, runWidget, type WidgetResult } from "@/lib/dashboard/run";
import { SOURCES, canUseSource, sourceMeta } from "@/lib/dashboard/sources";
import { DASHBOARD_RANGES, widgetSpecSchema, type RangePreset } from "@/lib/dashboard/spec";
import { dashboardsFor, sharedWith, type DashboardScope } from "@/lib/dashboard/store";
import { viewerFor } from "@/lib/dashboard/viewer";
import { resetToDefault, startEditing } from "./_dashboard/actions";
import type { CatalogItem } from "./_dashboard/add-widget";
import { AutoRefresh } from "./_dashboard/auto-refresh";
import { BUILTIN_LINKS, BuiltinView } from "./_dashboard/builtin-views";
import { DashboardGrid, type GridWidget } from "./_dashboard/dashboard-grid";
import { DashboardTabs } from "./_dashboard/dashboard-tabs";
import { RangePicker } from "./_dashboard/range-picker";
import { WidgetView } from "./_dashboard/widget-view";

// Dashboard (home): tabs of widgets each person arranges for themselves.
// Until someone changes theirs they see their role's default (HR sets it
// with ?defaults=ROLE), else today's built-in layout. Colleagues can share
// a dashboard read-only; every widget is computed with the viewer's own
// access. ?edit=1 arranges, ?range= sets the dates for every widget.

export const metadata = { title: "Dashboard" };

const ROLES: Role[] = ["HR_ADMIN", "MANAGER", "EMPLOYEE"];
const ROLE_NAMES: Record<Role, string> = { HR_ADMIN: "HR admins", MANAGER: "Managers", EMPLOYEE: "Employees" };

export default async function Home({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const raw = await searchParams;
  const isHr = user.role === "HR_ADMIN";
  const defaultsRole =
    isHr && typeof raw.defaults === "string" && (ROLES as string[]).includes(raw.defaults) ? (raw.defaults as Role) : null;
  const rangeOverride =
    typeof raw.range === "string" && (DASHBOARD_RANGES as string[]).includes(raw.range) ? (raw.range as RangePreset) : null;
  const scope: DashboardScope = defaultsRole ? { kind: "role", role: defaultsRole } : { kind: "user", userId: user.id, role: user.role };
  // Which role the dashboards are for: widgets and data choices follow it.
  const targetRole = defaultsRole ?? user.role;

  const [{ dashboards, origin }, shared, viewer, published] = await Promise.all([
    dashboardsFor(scope),
    defaultsRole ? Promise.resolve([]) : sharedWith(user.id),
    viewerFor(user),
    db.dashboardCatalogWidget.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  const owned = defaultsRole ? origin === "role-default" : origin === "own";
  const tabParam = typeof raw.tab === "string" ? raw.tab : "";
  const active = [...dashboards, ...shared].find((dashboard) => dashboard.id === tabParam) ?? dashboards[0];
  const isShared = shared.some((dashboard) => dashboard.id === active.id);
  const editing = raw.edit === "1" && owned && !isShared;

  // Run every widget on the open tab side by side, as the viewer.
  const builtins = await loadBuiltins(
    active.widgets.flatMap((widget) => (widget.builtinKey ? [widget.builtinKey] : [])),
    viewer,
  );
  const widgets: GridWidget[] = await Promise.all(
    active.widgets.map(async (widget) => {
      const spec = widget.builtinKey ? null : widgetSpecSchema.safeParse(widget.spec);
      if (widget.builtinKey) {
        const link = BUILTIN_LINKS[widget.builtinKey];
        return {
          id: widget.id,
          title: widget.title,
          width: widget.width,
          height: widget.height,
          href: link && canOpen(link, user.role) ? link : null,
          spec: null,
          content: <BuiltinView data={builtins.get(widget.builtinKey)} />,
        };
      }
      let result: WidgetResult;
      try {
        result = await runWidget(widget.spec, viewer, { rangeOverride });
      } catch (error) {
        console.error("dashboard widget failed", widget.id, error);
        result = { kind: "message", message: "Couldn't load this widget. Try refreshing." };
      }
      return {
        id: widget.id,
        title: widget.title,
        width: widget.width,
        height: widget.height,
        href: result.kind === "message" ? null : result.href,
        spec: spec?.success ? spec.data : null,
        content: <WidgetView result={result} title={widget.title} />,
      };
    }),
  );

  const catalog: CatalogItem[] = editing
    ? [
        ...CATALOG.filter((entry) => catalogRoles(entry).includes(targetRole)).map((entry) => ({
          id: entry.id,
          title: entry.title,
          description: entry.description,
          group: entry.group,
        })),
        ...published.flatMap((entry) => {
          const spec = widgetSpecSchema.safeParse(entry.spec);
          if (!spec.success || !canUseSource(SOURCES[spec.data.source], targetRole)) return [];
          return [{ id: entry.id, title: entry.title, description: entry.description ?? "Added by HR", group: "Added by HR", published: true }];
        }),
      ]
    : [];

  const query = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (defaultsRole) params.set("defaults", defaultsRole);
    if (rangeOverride) params.set("range", rangeOverride);
    for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
    const text = params.toString();
    return text ? `/?${text}` : "/";
  };
  const tabs = [
    ...dashboards.map((dashboard) => ({
      id: dashboard.id,
      name: dashboard.name,
      href: query({ tab: dashboard.id, edit: editing ? "1" : undefined }),
    })),
    ...shared.map((dashboard) => ({ id: dashboard.id, name: dashboard.name, href: query({ tab: dashboard.id }), sharedBy: dashboard.sharedBy })),
  ];

  const description = defaultsRole
    ? `The starting dashboard for ${ROLE_NAMES[defaultsRole].toLowerCase()}. People who haven't changed theirs see this; numbers here use your access.`
    : isShared
      ? `Shared with you by ${shared.find((dashboard) => dashboard.id === active.id)?.sharedBy}. Numbers use your own access.`
      : editing
        ? "Add, move and resize widgets. Changes save as you go."
        : "Your dashboard. Customise it to show what you need.";

  return (
    <PageShell>
      <PageHeader
        title={defaultsRole ? `Default dashboard · ${ROLE_NAMES[defaultsRole]}` : "Dashboard"}
        description={description}
        actions={
          <>
            <RangePicker />
            <AutoRefresh renderedAt={new Date().toISOString()} paused={editing} />
            {editing ? (
              <>
                <form action={resetToDefault}>
                  {defaultsRole && <input type="hidden" name="defaults" value={defaultsRole} />}
                  <Button type="submit" variant="outline" size="sm" title={defaultsRole ? "Go back to the built-in layout" : "Follow your role's default again"}>
                    {defaultsRole ? "Reset to built-in" : "Reset to default"}
                  </Button>
                </form>
                <Button size="sm" nativeButton={false} render={<Link href={query({ tab: active.id })} />}>
                  Done
                </Button>
              </>
            ) : (
              !isShared && (
                <form action={startEditing}>
                  {defaultsRole && <input type="hidden" name="defaults" value={defaultsRole} />}
                  <input type="hidden" name="tab" value={active.id} />
                  <input type="hidden" name="tabIndex" value={dashboards.findIndex((dashboard) => dashboard.id === active.id)} />
                  <Button type="submit" size="sm">
                    {owned ? "Edit dashboard" : "Customise"}
                  </Button>
                </form>
              )
            )}
          </>
        }
      />

      {isHr && (
        <nav aria-label="Role defaults" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
          <span>Defaults for:</span>
          {ROLES.map((role) => (
            <Link
              key={role}
              href={`/?defaults=${role}`}
              aria-current={defaultsRole === role ? "page" : undefined}
              className={defaultsRole === role ? "font-medium text-foreground" : "underline-offset-4 hover:underline"}
            >
              {ROLE_NAMES[role]}
            </Link>
          ))}
          {defaultsRole && (
            <Link href="/" className="underline-offset-4 hover:underline">
              ← My dashboard
            </Link>
          )}
        </nav>
      )}

      <div className="mt-6">
        <DashboardTabs
          tabs={tabs}
          activeId={active.id}
          editing={editing}
          defaultsRole={defaultsRole}
          canShare={!defaultsRole && owned && !isShared}
        />
        <DashboardGrid
          key={active.id}
          dashboardId={active.id}
          widgets={widgets}
          editing={editing}
          isHr={isHr}
          sources={sourceMeta(targetRole)}
          catalog={catalog}
        />
      </div>
    </PageShell>
  );
}
