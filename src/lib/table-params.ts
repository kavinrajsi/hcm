// Parses the shared data-table searchParams (q, day, month, year, type,
// page) into values the module query functions feed into Prisma.

import { PAGE_SIZE } from "@/components/data-table/pagination";

export type TableParams = {
  q?: string;
  day?: number;
  month?: number;
  year?: number;
  type?: string;
  page: number;
  skip: number;
  take: number;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function toInt(value: string | string[] | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function parseTableParams(raw: RawSearchParams): TableParams {
  const page = Math.max(1, toInt(raw.page) ?? 1);
  return {
    q: typeof raw.q === "string" && raw.q.trim() ? raw.q.trim() : undefined,
    day: toInt(raw.day),
    month: toInt(raw.month),
    year: toInt(raw.year),
    type: typeof raw.type === "string" && raw.type ? raw.type : undefined,
    page,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  };
}

/**
 * Builds a date range for a Prisma date filter from day/month/year parts.
 * Any combination works: year only, month+year, or an exact day.
 * Month/day without a year fall back to the current year (matches how HR
 * scans "joiners in March"). Returns undefined when no parts are given.
 */
export function datePartsToRange(
  params: Pick<TableParams, "day" | "month" | "year">,
): { gte: Date; lt: Date } | undefined {
  const { day, month, year } = params;
  if (!day && !month && !year) return undefined;

  const resolvedYear = year ?? new Date().getFullYear();
  if (month && day) {
    const start = new Date(Date.UTC(resolvedYear, month - 1, day));
    return {
      gte: start,
      lt: new Date(Date.UTC(resolvedYear, month - 1, day + 1)),
    };
  }
  if (month) {
    return {
      gte: new Date(Date.UTC(resolvedYear, month - 1, 1)),
      lt: new Date(Date.UTC(resolvedYear, month, 1)),
    };
  }
  if (day) {
    // Day without month: interpret as that day in the current month.
    const currentMonth = new Date().getMonth();
    return {
      gte: new Date(Date.UTC(resolvedYear, currentMonth, day)),
      lt: new Date(Date.UTC(resolvedYear, currentMonth, day + 1)),
    };
  }
  return {
    gte: new Date(Date.UTC(resolvedYear, 0, 1)),
    lt: new Date(Date.UTC(resolvedYear + 1, 0, 1)),
  };
}

/** Add Filter options from groupBy rows: most common first, blanks dropped. */
export function optionsByCount<T extends { _count: number }>(
  rows: T[],
  key: (row: T) => string | null,
): { value: string; count: number }[] {
  return rows
    .map((row) => ({ value: key(row) ?? "", count: row._count }))
    .filter((option) => option.value.trim())
    .sort(
      (left, right) =>
        right.count - left.count || left.value.localeCompare(right.value),
    );
}

/** A trimmed single search-param value (capped), or undefined. */
export function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 200)
    : undefined;
}
