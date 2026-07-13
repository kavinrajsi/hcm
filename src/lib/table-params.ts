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
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
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

  const y = year ?? new Date().getFullYear();
  if (month && day) {
    const start = new Date(Date.UTC(y, month - 1, day));
    return { gte: start, lt: new Date(Date.UTC(y, month - 1, day + 1)) };
  }
  if (month) {
    return {
      gte: new Date(Date.UTC(y, month - 1, 1)),
      lt: new Date(Date.UTC(y, month, 1)),
    };
  }
  if (day) {
    // Day without month: interpret as that day in the current month.
    const m = new Date().getMonth();
    return {
      gte: new Date(Date.UTC(y, m, day)),
      lt: new Date(Date.UTC(y, m, day + 1)),
    };
  }
  return {
    gte: new Date(Date.UTC(y, 0, 1)),
    lt: new Date(Date.UTC(y + 1, 0, 1)),
  };
}
