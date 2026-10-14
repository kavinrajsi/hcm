// Dashboard widgets: rows → chart groups. Pure (tested): time buckets in IST
// with empty periods filled in, or field groups biggest first with the rest
// folded into "Other".

import type { TimeBucket } from "./spec";
import { addDays, bucketKey, bucketLabel, bucketSpan, type DayRange } from "./time";

export type AggregateRow = { day: string | null; value: number; keys: Record<string, string | string[]> };
export type Group = { key: string; label: string; value: number };

export const OTHER_KEY = "__other";

/** Sum of every row once (a row with several values for a field still counts once). */
export const totalOf = (rows: AggregateRow[]) => rows.reduce((sum, row) => sum + row.value, 0);

export function groupByTime(rows: AggregateRow[], bucket: TimeBucket, range: DayRange): Group[] {
  const sums = new Map<string, number>();
  const days = rows.flatMap((row) => (row.day ? [row.day] : []));
  for (const row of rows) {
    if (!row.day) continue;
    const key = bucketKey(row.day, bucket);
    sums.set(key, (sums.get(key) ?? 0) + row.value);
  }
  if (days.length === 0 && !(range.from && range.to)) return [];
  const sortedDays = [...days].sort();
  const first = range.from ?? sortedDays[0];
  const last = range.to ? addDays(range.to, -1) : sortedDays[sortedDays.length - 1];
  const keys = first && last && first <= last ? bucketSpan(first, last, bucket) : [...sums.keys()].sort();
  return keys.map((key) => ({ key, label: bucketLabel(key, bucket), value: sums.get(key) ?? 0 }));
}

export function groupByField(rows: AggregateRow[], field: string, labels: Map<string, string>, limit: number): Group[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const raw = row.keys[field];
    const values = Array.isArray(raw) ? raw : [raw ?? ""];
    for (const value of new Set(values)) sums.set(value, (sums.get(value) ?? 0) + row.value);
  }
  const groups = [...sums]
    .map(([key, value]) => ({ key, label: labels.get(key) ?? (key || "None"), value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
  if (groups.length <= limit) return groups;
  const rest = groups.slice(limit);
  return [
    ...groups.slice(0, limit),
    {
      key: OTHER_KEY,
      label: `Other (${rest.length})`,
      value: rest.reduce((sum, group) => sum + group.value, 0),
    },
  ];
}

/** "1,234", "12.5 h", "3.5 days" — Indian digit grouping. */
export function formatValue(value: number, unit?: string): string {
  const rounded = unit ? Math.round(value * 10) / 10 : Math.round(value);
  const text = rounded.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  if (unit === "h") return `${text} h`;
  if (unit === "days") return `${text} ${rounded === 1 ? "day" : "days"}`;
  return text;
}

/** "+12%" / "−3%" against the previous period; null when there is nothing to compare. */
export function changeText(current: number, previous: number | null): string | null {
  if (previous === null) return null;
  if (previous === 0) return current === 0 ? "No change" : "New";
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return "No change";
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`;
}
