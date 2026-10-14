// Dashboard widgets: date ranges and time buckets, all in IST calendar days
// ("YYYY-MM-DD"). Pure, so the engine and its tests share one definition.

import type { DateRangeSpec, TimeBucket } from "./spec";

const DAY_MS = 86_400_000;
const IST_MS = 330 * 60_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** IST calendar days [from, to); either end may be open. */
export type DayRange = {
  from?: string;
  to?: string;
  /** "Upcoming": timestamps count from this instant, not the start of today. */
  fromNow?: Date;
};

export const todayKey = (now: Date) => new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** First day of the month `months` away from `day`'s month. */
export function addMonths(day: string, months: number): string {
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
}

const monthStart = (day: string) => `${day.slice(0, 8)}01`;

/** Monday of the week `day` falls in. */
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

const LAST_MONTHS: Record<string, number> = {
  "last-3-months": 3,
  "last-6-months": 6,
  "last-12-months": 12,
};

export function resolveRange(range: DateRangeSpec, now: Date): DayRange {
  const today = todayKey(now);
  const month = monthStart(today);
  switch (range.preset) {
    case "today":
      return { from: today, to: addDays(today, 1) };
    case "this-week":
      return { from: weekStart(today), to: addDays(weekStart(today), 7) };
    case "this-month":
      return { from: month, to: addMonths(month, 1) };
    case "last-month":
      return { from: addMonths(month, -1), to: month };
    case "last-3-months":
    case "last-6-months":
    case "last-12-months":
      // Includes the current month: last 3 months in October = Aug–Oct.
      return { from: addMonths(month, 1 - LAST_MONTHS[range.preset]), to: addMonths(month, 1) };
    case "this-year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${Number(today.slice(0, 4)) + 1}-01-01` };
    case "to-month-end":
      return { to: addMonths(month, 1) };
    case "upcoming":
      return { from: today, fromNow: now };
    case "next-30-days":
      return { from: today, to: addDays(today, 30) };
    case "custom":
      return { from: range.from, to: range.to ? addDays(range.to, 1) : undefined };
    default:
      return {};
  }
}

/** The period just before `range`, same length, for "vs last period"; null when open-ended. */
export function previousRange(range: DateRangeSpec, now: Date): DayRange | null {
  const current = resolveRange(range, now);
  if (!current.from || !current.to) return null;
  const months: Record<string, number> = {
    "this-month": 1,
    "last-month": 1,
    "this-year": 12,
    ...LAST_MONTHS,
  };
  const span = months[range.preset];
  if (span) return { from: addMonths(current.from, -span), to: current.from };
  const days = Math.round((Date.parse(current.to) - Date.parse(current.from)) / DAY_MS);
  return { from: addDays(current.from, -days), to: current.from };
}

/** Prisma bounds for a @db.Date column (stored as UTC midnight). */
export function dateBounds(range: DayRange): { gte?: Date; lt?: Date } | undefined {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: new Date(`${range.from}T00:00:00Z`) } : {}),
    ...(range.to ? { lt: new Date(`${range.to}T00:00:00Z`) } : {}),
  };
}

/** Prisma bounds for a timestamp column (IST midnights, or now for "upcoming"). */
export function instantBounds(range: DayRange): { gte?: Date; lt?: Date } | undefined {
  if (!range.from && !range.to) return undefined;
  const at = (day: string) => new Date(`${day}T00:00:00+05:30`);
  return {
    ...(range.fromNow ? { gte: range.fromNow } : range.from ? { gte: at(range.from) } : {}),
    ...(range.to ? { lt: at(range.to) } : {}),
  };
}

/** The IST day of a value: @db.Date values are UTC midnight, timestamps shift to IST. */
export function dayOf(value: Date, kind: "date" | "instant"): string {
  return kind === "date" ? value.toISOString().slice(0, 10) : todayKey(value);
}

/** Sortable key of the bucket a day falls in. */
export function bucketKey(day: string, bucket: TimeBucket): string {
  switch (bucket) {
    case "day":
      return day;
    case "week":
      return weekStart(day);
    case "month":
      return day.slice(0, 7);
    case "quarter":
      return `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;
  }
}

export function bucketLabel(key: string, bucket: TimeBucket): string {
  switch (bucket) {
    case "day":
      return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
    case "week":
      return `Wk ${key.slice(8, 10)}/${key.slice(5, 7)}`;
    case "month":
      return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
    case "quarter":
      return `${key.slice(5)} ${key.slice(0, 4)}`;
  }
}

const MAX_BUCKETS = 400;

/** Every bucket key from `first` to `last` day (inclusive), so empty periods show as 0. */
export function bucketSpan(first: string, last: string, bucket: TimeBucket): string[] {
  const keys: string[] = [];
  let day = first;
  const step = (current: string) =>
    bucket === "day"
      ? addDays(current, 1)
      : bucket === "week"
        ? addDays(weekStart(current), 7)
        : bucket === "month"
          ? addMonths(current, 1)
          : addMonths(current, 3 - ((Number(current.slice(5, 7)) - 1) % 3));
  while (day <= last && keys.length < MAX_BUCKETS) {
    const key = bucketKey(day, bucket);
    if (keys[keys.length - 1] !== key) keys.push(key);
    day = step(day);
  }
  return keys;
}
