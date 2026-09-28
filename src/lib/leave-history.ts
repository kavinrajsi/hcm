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
  entry: Pick<HistoryEntry, "startDate" | "postedOn">,
): number {
  return (entry.startDate ?? entry.postedOn).getUTCFullYear();
}

/** Distinct years with posts, newest first. */
export function leaveYears(entries: HistoryEntry[]): number[] {
  return [...new Set(entries.map(entryYear))].sort(
    (earlierYear, laterYear) => laterYear - earlierYear,
  );
}

export function filterByYear<T extends HistoryEntry>(
  entries: T[],
  year: number | "all",
): T[] {
  return year === "all"
    ? entries
    : entries.filter((entry) => entryYear(entry) === year);
}

export function summarizeLeave(entries: HistoryEntry[]): LeaveSummary {
  const summary: LeaveSummary = {
    leaveDays: 0,
    fullDays: 0,
    halfDays: 0,
    late: 0,
    early: 0,
    wfh: 0,
    pending: 0,
  };
  for (const entry of entries) {
    if (entry.status === "PENDING") summary.pending++;
    if (entry.status === "REJECTED") continue;
    if (entry.type === "FULL_DAY") {
      summary.fullDays += entry.days ?? 1;
      summary.leaveDays += entry.days ?? 1;
    } else if (entry.type === "HALF_DAY") {
      summary.halfDays++;
      summary.leaveDays += entry.days ?? 0.5;
    } else if (entry.type === "LATE_ARRIVAL") summary.late++;
    else if (entry.type === "EARLY_LOGOUT") summary.early++;
    else if (entry.type === "WFH") summary.wfh++;
  }
  return summary;
}
