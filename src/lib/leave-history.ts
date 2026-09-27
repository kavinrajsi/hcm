import type { LeaveStatusValue, LeaveTypeValue } from "@/lib/leave";

// One employee's leave posts: years present, filtering and the summary shown
// on the employee page. "Leave days" follows the Leave page's rule: full +
// half days, rejected posts excluded.

export type HistoryEntry = {
  id: string;
  startDate: Date | null;
  endDate: Date | null;
  postedOn: Date;
  type: LeaveTypeValue | null;
  days: number | null;
  status: LeaveStatusValue;
};

export type LeaveSummary = {
  leaveDays: number;
  fullDays: number;
  halfDays: number;
  late: number;
  early: number;
  wfh: number;
  pending: number;
};

/** Year a post counts towards: its leave date, else the day it was posted. */
export function entryYear(
  e: Pick<HistoryEntry, "startDate" | "postedOn">,
): number {
  return (e.startDate ?? e.postedOn).getUTCFullYear();
}

/** Distinct years with posts, newest first. */
export function leaveYears(entries: HistoryEntry[]): number[] {
  return [...new Set(entries.map(entryYear))].sort((a, b) => b - a);
}

export function filterByYear<T extends HistoryEntry>(
  entries: T[],
  year: number | "all",
): T[] {
  return year === "all"
    ? entries
    : entries.filter((e) => entryYear(e) === year);
}

export function summarizeLeave(entries: HistoryEntry[]): LeaveSummary {
  const s: LeaveSummary = {
    leaveDays: 0,
    fullDays: 0,
    halfDays: 0,
    late: 0,
    early: 0,
    wfh: 0,
    pending: 0,
  };
  for (const e of entries) {
    if (e.status === "PENDING") s.pending++;
    if (e.status === "REJECTED") continue;
    if (e.type === "FULL_DAY") {
      s.fullDays += e.days ?? 1;
      s.leaveDays += e.days ?? 1;
    } else if (e.type === "HALF_DAY") {
      s.halfDays++;
      s.leaveDays += e.days ?? 0.5;
    } else if (e.type === "LATE_ARRIVAL") s.late++;
    else if (e.type === "EARLY_LOGOUT") s.early++;
    else if (e.type === "WFH") s.wfh++;
  }
  return s;
}
