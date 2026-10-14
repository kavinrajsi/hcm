// Dashboard widgets: run one widget spec for one viewer. The spec is
// re-validated here every time (saved JSON is never trusted), the source must
// allow the viewer's role, and the source applies the viewer's own scope.

import type { Role } from "@/generated/prisma/enums";
import { NAV, canSee } from "@/lib/nav";
import { changeText, formatValue, groupByField, groupByTime, OTHER_KEY, totalOf } from "./aggregate";
import { RANGE_PRESETS, widgetSpecSchema, timeBucketOf, type ChartType, type DateRangeSpec, type RangePreset, type WidgetSpec } from "./spec";
import { canUseSource, fieldLabels, SOURCES, type LoadContext, type Source, type Viewer } from "./sources";
import { previousRange, resolveRange, todayKey } from "./time";

export type ResultGroup = { key: string; label: string; value: number; display: string; href: string | null };

export type WidgetResult =
  | {
      kind: "number";
      value: number;
      display: string;
      label: string;
      change: string | null;
      previousDisplay: string | null;
      href: string | null;
      /** Set when the dashboard's date picker replaced the widget's own dates. */
      period?: string | null;
    }
  | {
      kind: "groups";
      chart: Exclude<ChartType, "number">;
      groups: ResultGroup[];
      byTime: boolean;
      total: string;
      label: string;
      href: string | null;
      period?: string | null;
    }
  | { kind: "message"; message: string; href?: string | null };

const NAV_ITEMS = NAV.flatMap((group) => group.items);

/** Same rule as the sidebar: never link to a page the viewer can't open. */
export function canOpen(href: string, role: Role): boolean {
  const path = href.split("?")[0];
  const item = NAV_ITEMS.find((navItem) => navItem.url === path);
  return !item || canSee(item, role);
}

// Snapshot and forward-looking ranges keep their own dates when the
// dashboard's date picker is set ("Active employees" must not become
// "joined this month").
const KEEPS_OWN_RANGE: RangePreset[] = ["all", "today", "to-month-end", "upcoming", "next-30-days"];

export function effectiveRange(own: DateRangeSpec, override: RangePreset | null): DateRangeSpec {
  if (!override || KEEPS_OWN_RANGE.includes(own.preset)) return own;
  return { preset: override };
}

function linkFor(
  source: Source,
  viewer: Viewer,
  spec: WidgetSpec,
  dateField: string,
  group?: { field: string; value: string },
): string | null {
  const base = source.page(viewer, { dateField, filters: spec.filters, rangePreset: spec.range.preset });
  const url = new URL(base, "http://hcm.local");
  for (const field of source.fields) {
    if (!field.param) continue;
    for (const value of spec.filters[field.key] ?? []) url.searchParams.append(field.param, value);
  }
  if (group && group.value !== OTHER_KEY) {
    const field = source.fields.find((candidate) => candidate.key === group.field);
    if (field?.param) url.searchParams.set(field.param, group.value);
  }
  const href = `${url.pathname}${url.search}`;
  return canOpen(href, viewer.role) ? href : null;
}

/** Drops filters, grouping and dates the source doesn't have. */
export function cleanSpec(source: Source, spec: WidgetSpec): WidgetSpec & { dateField: string } {
  const filterable = new Set(source.fields.filter((field) => field.filter !== false).map((field) => field.key));
  const groupable = new Set(source.fields.filter((field) => field.group !== false).map((field) => field.key));
  const dateField = source.dateFields.find((field) => field.key === spec.dateField)?.key ?? source.dateFields[0]?.key ?? "";
  const bucket = timeBucketOf(spec.groupBy);
  const groupBy =
    spec.chart === "number"
      ? undefined
      : bucket
        ? dateField
          ? spec.groupBy
          : undefined
        : spec.groupBy && groupable.has(spec.groupBy)
          ? spec.groupBy
          : undefined;
  return {
    ...spec,
    measure: source.measures.find((measure) => measure.key === spec.measure)?.key ?? source.measures[0].key,
    dateField,
    groupBy,
    filters: Object.fromEntries(Object.entries(spec.filters).filter(([key, values]) => filterable.has(key) && values.length)),
    range: dateField ? spec.range : { preset: "all" },
  };
}

export async function runWidget(
  rawSpec: unknown,
  viewer: Viewer,
  { now = new Date(), rangeOverride = null }: { now?: Date; rangeOverride?: RangePreset | null } = {},
): Promise<WidgetResult> {
  const parsed = widgetSpecSchema.safeParse(rawSpec);
  if (!parsed.success) return { kind: "message", message: "This widget's settings can't be read. Edit it to fix them." };
  const source = SOURCES[parsed.data.source];
  if (!canUseSource(source, viewer.role)) return { kind: "message", message: "Not available for your role." };
  const spec = cleanSpec(source, parsed.data);
  const range = effectiveRange(spec.range, spec.dateField ? rangeOverride : null);
  const measure = source.measures.find((candidate) => candidate.key === spec.measure)!;
  const context: LoadContext = {
    viewer,
    range: resolveRange(range, now),
    dateField: spec.dateField,
    filters: spec.filters,
    measure: measure.key,
    today: todayKey(now),
  };
  const href = linkFor(source, viewer, spec, spec.dateField);
  const period = range.preset !== spec.range.preset ? RANGE_PRESETS[range.preset] : null;

  const total = async (load: LoadContext) =>
    measure.key === "count" && source.count ? source.count(load) : totalOf(await source.load(load));

  if (spec.chart === "number" || !spec.groupBy) {
    const value = await total(context);
    const previous = spec.compare ? previousRange(range, now) : null;
    const previousValue = previous ? await total({ ...context, range: previous }) : null;
    return {
      kind: "number",
      value,
      display: formatValue(value, measure.unit),
      label: measure.label,
      change: changeText(value, previousValue),
      previousDisplay: previousValue === null ? null : formatValue(previousValue, measure.unit),
      href,
      period,
    };
  }

  const rows = await source.load(context);
  const bucket = timeBucketOf(spec.groupBy);
  let groups;
  if (bucket) groups = groupByTime(rows, bucket, context.range);
  else {
    const field = source.fields.find((candidate) => candidate.key === spec.groupBy)!;
    groups = groupByField(rows, field.key, await fieldLabels(field, viewer), spec.limit);
  }
  return {
    kind: "groups",
    chart: spec.chart,
    byTime: Boolean(bucket),
    groups: groups.map((group) => ({
      ...group,
      display: formatValue(group.value, measure.unit),
      href: bucket ? href : linkFor(source, viewer, spec, spec.dateField, { field: spec.groupBy!, value: group.key }),
    })),
    total: formatValue(totalOf(rows), measure.unit),
    label: measure.label,
    href,
    period,
  };
}
