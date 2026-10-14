// Dashboard widgets: what a widget asks for (source, measure, grouping,
// filters, date range, chart). Shared by the builder (client) and the engine
// (server), so no server imports. Saved specs are re-checked with
// `widgetSpecSchema` every time a widget runs, never trusted from the database.

import { z } from "zod";

export const SOURCE_KEYS = [
  "employees",
  "leave",
  "candidates",
  "quantumHours",
  "quantumTodos",
  "sessions",
  "devices",
  "probation",
  "idCards",
  "freelancers",
] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

export const CHART_TYPES = ["number", "bar", "line", "pie", "table"] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const CHART_LABELS: Record<ChartType, string> = {
  number: "Number",
  bar: "Bar",
  line: "Line",
  pie: "Donut",
  table: "Table",
};

export const TIME_BUCKETS = ["day", "week", "month", "quarter"] as const;
export type TimeBucket = (typeof TIME_BUCKETS)[number];
export const TIME_BUCKET_LABELS: Record<TimeBucket, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
};

export const RANGE_PRESETS = {
  all: "All time",
  today: "Today",
  "this-week": "This week",
  "this-month": "This month",
  "last-month": "Last month",
  "last-3-months": "Last 3 months",
  "last-6-months": "Last 6 months",
  "last-12-months": "Last 12 months",
  "this-year": "This year",
  "to-month-end": "Up to the end of this month",
  upcoming: "Upcoming",
  "next-30-days": "Next 30 days",
  custom: "Custom dates",
} as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const dateRangeSchema = z.object({
  preset: z.enum(Object.keys(RANGE_PRESETS) as [RangePreset, ...RangePreset[]]),
  from: z.string().regex(ISO_DAY).optional(),
  to: z.string().regex(ISO_DAY).optional(),
});
export type DateRangeSpec = z.infer<typeof dateRangeSchema>;

export const widgetSpecSchema = z.object({
  source: z.enum(SOURCE_KEYS),
  measure: z.string().max(40).default("count"),
  /** Which date the range applies to (e.g. joined vs exited); first one if unset. */
  dateField: z.string().max(40).optional(),
  /** A field key, or "time:<bucket>". Unset = one number. */
  groupBy: z.string().max(40).optional(),
  /** Field key → allowed values. */
  filters: z.record(z.string().max(40), z.array(z.string().max(200)).max(200)).default({}),
  range: dateRangeSchema.default({ preset: "all" }),
  chart: z.enum(CHART_TYPES).default("number"),
  /** Number tiles: show the change against the period before. */
  compare: z.boolean().default(false),
  /** Bars, donut and table: how many groups before the rest fold into "Other". */
  limit: z.number().int().min(1).max(50).default(10),
});
export type WidgetSpec = z.infer<typeof widgetSpecSchema>;

/** Grid sizes: columns (of 4) × rows. Phones show every widget full width. */
export const WIDGET_SIZES = {
  small: { width: 1, height: 1, label: "Small" },
  wide: { width: 2, height: 1, label: "Wide" },
  tall: { width: 1, height: 2, label: "Tall" },
  medium: { width: 2, height: 2, label: "Medium" },
  large: { width: 4, height: 2, label: "Full width" },
  huge: { width: 4, height: 3, label: "Full width, tall" },
} as const;
export type WidgetSize = keyof typeof WIDGET_SIZES;

export function sizeKey(width: number, height: number): WidgetSize {
  const match = (Object.keys(WIDGET_SIZES) as WidgetSize[]).find(
    (key) => WIDGET_SIZES[key].width === width && WIDGET_SIZES[key].height === height,
  );
  return match ?? "medium";
}

/** A sensible starting size for a chart type. */
export function defaultSize(chart: ChartType): WidgetSize {
  if (chart === "number") return "small";
  if (chart === "line") return "large";
  return "medium";
}

export const timeBucketOf = (groupBy: string | undefined): TimeBucket | null => {
  const bucket = groupBy?.startsWith("time:") ? groupBy.slice(5) : null;
  return bucket && (TIME_BUCKETS as readonly string[]).includes(bucket) ? (bucket as TimeBucket) : null;
};

/** The dashboard-wide date picker's choices (?range=). */
export const DASHBOARD_RANGES: RangePreset[] = [
  "this-month",
  "last-month",
  "last-3-months",
  "last-6-months",
  "last-12-months",
  "this-year",
  "all",
];
