import type { Prisma } from "@/generated/prisma/client";
import { DATE_PRESETS, dayRange, type DatePreset } from "@/lib/date-filter";
import { formatDay } from "@/lib/format-date";
import {
  LEAVE_STATUSES,
  LEAVE_TYPES,
  type LeaveStatusValue,
  type LeaveTypeValue,
} from "@/lib/leave";

// WHERE building for /leave: list, month calendar and the "Most leave days"
// chips share the search / type / status filters; only the list and the
// chips take the date range (the calendar shows its own month).

/** Type filter values beyond the enum: no type yet, no employee match. */
export const SPECIAL_TYPES = ["UNCLASSIFIED", "UNMATCHED"] as const;
const DAY_TYPES: LeaveTypeValue[] = ["FULL_DAY", "HALF_DAY"];

export type LeaveFilters = {
  q?: string;
  /** Leave types, plus UNCLASSIFIED / UNMATCHED. */
  type?: string[];
  status?: string[];
  /** Preset key from DATE_PRESETS; ignored when from/to are set. */
  date?: string;
  /** Custom range, IST "YYYY-MM-DD" (to is inclusive). */
  from?: string;
  to?: string;
};

type Where = Prisma.LeaveEntryWhereInput;

const upper = (values?: string[]) =>
  (values ?? []).map((value) => value.toUpperCase());

/** Known leave types from the filter; unknown values are dropped. */
export function pickedTypes(filters: LeaveFilters): LeaveTypeValue[] {
  const values = upper(filters.type);
  return LEAVE_TYPES.filter((leaveType) => values.includes(leaveType));
}

export function pickedStatuses(filters: LeaveFilters): LeaveStatusValue[] {
  const values = upper(filters.status);
  return LEAVE_STATUSES.filter((status) => values.includes(status));
}

function searchWhere(searchQuery?: string): Where[] {
  const query = searchQuery?.trim();
  if (!query) return [];
  return [
    {
      OR: [
        { creatorName: { contains: query, mode: "insensitive" } },
        { employee: { name: { contains: query, mode: "insensitive" } } },
        { message: { contains: query, mode: "insensitive" } },
      ],
    },
  ];
}

/** Search, type and status — shared by the list and the calendar. */
export function leaveConditions(filters: LeaveFilters): Where[] {
  const and = searchWhere(filters.q);
  const values = upper(filters.type);
  const types = pickedTypes(filters);
  const typeOr: Where[] = [];
  if (types.length) typeOr.push({ type: { in: types } });
  if (values.includes("UNCLASSIFIED")) typeOr.push({ type: null });
  if (values.includes("UNMATCHED")) typeOr.push({ employeeId: null });
  if (typeOr.length) and.push(typeOr.length === 1 ? typeOr[0] : { OR: typeOr });
  const statuses = pickedStatuses(filters);
  if (statuses.length) and.push({ status: { in: statuses } });
  return and;
}

/** Days the date filter covers; undefined = no date filter. */
export function leaveDateRange(filters: LeaveFilters, now = new Date()) {
  return dayRange({ preset: filters.date, from: filters.from, to: filters.to }, now);
}

/** An entry's day is its start date, or the day it was posted. */
export function onDays(range: { gte?: Date; lt?: Date }): Where {
  return { OR: [{ startDate: range }, { startDate: null, postedOn: range }] };
}

/**
 * Conditions for the "Most leave days" chips: full/half days per matched
 * employee, not rejected unless asked for, in the date range (default: this
 * year). With a type filter, only its full/half-day types count; null when it
 * picks none of those (nothing to total — the page hides the chips).
 */
export function leaveTotalsConditions(
  filters: LeaveFilters,
  yearStart: Date,
  now = new Date(),
): Where[] | null {
  const values = upper(filters.type);
  const picked =
    pickedTypes(filters).length > 0 ||
    SPECIAL_TYPES.some((special) => values.includes(special));
  const types = picked
    ? pickedTypes(filters).filter((leaveType) => DAY_TYPES.includes(leaveType))
    : DAY_TYPES;
  if (!types.length) return null;
  const statuses = pickedStatuses(filters);
  const range = leaveDateRange(filters, now);
  return [
    { employeeId: { not: null } },
    { type: { in: types } },
    statuses.length ? { status: { in: statuses } } : { status: { not: "REJECTED" } },
    range ? onDays(range) : { startDate: { gte: yearStart } },
    ...searchWhere(filters.q),
  ];
}

/** "(full days)", "(half days)" or "(full + half days)" for the chips. */
export function leaveTotalsKind(filters: LeaveFilters): string {
  const types = pickedTypes(filters).filter((leaveType) => DAY_TYPES.includes(leaveType));
  if (types.length === 1) return types[0] === "FULL_DAY" ? "full days" : "half days";
  return "full + half days";
}

/** "in 2026", "this month", "01/03/2026 – 31/03/2026": the chips' period. */
export function leaveTotalsPeriod(filters: LeaveFilters, now = new Date()): string {
  const valid = (value?: string) =>
    value && /^\d{4}-\d{2}-\d{2}/.test(value) ? formatDay(value.slice(0, 10)) : undefined;
  if (filters.from || filters.to) {
    const from = valid(filters.from);
    const to = valid(filters.to);
    if (from && to) return from === to ? `on ${from}` : `${from} – ${to}`;
    if (from) return `from ${from}`;
    if (to) return `up to ${to}`;
  }
  const preset = filters.date as DatePreset | undefined;
  if (preset && leaveDateRange({ date: preset }, now)) {
    if (preset === "month") return "this month";
    if (preset === "year") return "this year";
    return `in the ${DATE_PRESETS[preset].toLowerCase()}`;
  }
  return `in ${now.getUTCFullYear()}`;
}
