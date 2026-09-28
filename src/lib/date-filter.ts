// Date filter for the Add Filter menu: a preset ("7d", "month", …) or a
// custom from/to range, all in IST. Two flavours of WHERE bounds: instants
// for timestamp columns, whole days for @db.Date columns (stored as UTC
// midnight). Free of server imports so the client menu can share it.

export const DATE_PRESETS = {
  "1h": "Last Hour",
  "24h": "Last 24 Hours",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  month: "This Month",
  year: "This Year",
} as const;
export type DatePreset = keyof typeof DATE_PRESETS;

export type DateFilter = {
  /** Key of DATE_PRESETS; ignored when from/to are set. */
  preset?: string;
  /** Custom range, IST: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" (to is inclusive). */
  from?: string;
  to?: string;
};

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/;

/** YYYY-MM-DD of an instant in Asia/Kolkata. */
export function istDay(now = new Date()): string {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
}

function utcMidnight(day: string, addDays = 0): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) + addDays * DAY_MS);
}

function nextMonth(day: string): string {
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

/** An IST wall-clock "YYYY-MM-DD[THH:MM]" as an instant. */
export function parseIstDateTime(value?: string): Date | undefined {
  const match = value ? DATE_TIME.exec(value) : null;
  if (!match) return undefined;
  const parsed = new Date(`${match[1]}T${match[2] ?? "00:00"}:00Z`);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : new Date(parsed.getTime() - IST_MS);
}

/** The IST calendar days a preset covers, as [first, last + 1). */
function presetDays(preset: string | undefined, now: Date) {
  const today = istDay(now);
  switch (preset) {
    case "7d":
      return { from: utcMidnight(today, -6), to: utcMidnight(today, 1) };
    case "30d":
      return { from: utcMidnight(today, -29), to: utcMidnight(today, 1) };
    case "month": {
      const first = `${today.slice(0, 8)}01`;
      return { from: utcMidnight(first), to: utcMidnight(nextMonth(first)) };
    }
    case "year": {
      const year = Number(today.slice(0, 4));
      return {
        from: utcMidnight(`${year}-01-01`),
        to: utcMidnight(`${year + 1}-01-01`),
      };
    }
  }
  return undefined;
}

/**
 * Bounds for a timestamp column. Rolling presets count back from `now`;
 * month/year start at IST midnight. A date-only `to` covers that whole day,
 * a timed one that whole minute.
 */
export function instantRange(
  filter: DateFilter,
  now = new Date(),
): { gte?: Date; lt?: Date } | undefined {
  if (filter.from || filter.to) {
    const gte = parseIstDateTime(filter.from);
    const end = parseIstDateTime(filter.to);
    const rangeEnd =
      end &&
      new Date(end.getTime() + (filter.to!.includes("T") ? 60_000 : DAY_MS));
    return gte || rangeEnd ? { gte, lt: rangeEnd } : undefined;
  }
  const hours = { "1h": 1, "24h": 24, "7d": 168, "30d": 720 }[
    filter.preset ?? ""
  ];
  if (hours) return { gte: new Date(now.getTime() - hours * 3_600_000) };
  const days = presetDays(filter.preset, now);
  if (days && (filter.preset === "month" || filter.preset === "year")) {
    return { gte: new Date(days.from.getTime() - IST_MS) };
  }
  return undefined;
}

/** Bounds for a @db.Date column: whole days, times ignored. */
export function dayRange(
  filter: DateFilter,
  now = new Date(),
): { gte?: Date; lt?: Date } | undefined {
  if (filter.from || filter.to) {
    const valid = (value?: string) =>
      value && DATE_TIME.test(value) && parseIstDateTime(value)
        ? value.slice(0, 10)
        : undefined;
    const from = valid(filter.from);
    const to = valid(filter.to);
    if (!from && !to) return undefined;
    return {
      gte: from ? utcMidnight(from) : undefined,
      lt: to ? utcMidnight(to, 1) : undefined,
    };
  }
  const days = presetDays(filter.preset, now);
  return days && { gte: days.from, lt: days.to };
}
