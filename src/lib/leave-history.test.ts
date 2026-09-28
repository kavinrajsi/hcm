import { describe, expect, it } from "vitest";
import {
  filterByYear,
  leaveYears,
  summarizeLeave,
  type HistoryEntry,
} from "./leave-history";

const utcDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
let entrySeq = 0;
const entry = (overrides: Partial<HistoryEntry>): HistoryEntry => ({
  id: `e${entrySeq++}`,
  startDate: null,
  endDate: null,
  postedOn: utcDate("2026-03-01"),
  type: "FULL_DAY",
  days: 1,
  status: "APPROVED",
  ...overrides,
});

describe("leaveYears / filterByYear", () => {
  const entries = [
    entry({ startDate: utcDate("2026-01-05") }),
    entry({ startDate: null, postedOn: utcDate("2024-12-31") }),
    entry({
      startDate: utcDate("2025-06-01"),
      postedOn: utcDate("2025-05-30"),
    }),
    entry({ startDate: utcDate("2026-02-10") }),
  ];

  it("lists years newest first, by leave date (else post date)", () => {
    expect(leaveYears(entries)).toEqual([2026, 2025, 2024]);
  });

  it("filters to one year or keeps all", () => {
    expect(filterByYear(entries, 2026)).toHaveLength(2);
    expect(filterByYear(entries, 2024)).toHaveLength(1);
    expect(filterByYear(entries, "all")).toHaveLength(4);
  });
});

describe("summarizeLeave", () => {
  it("counts leave days as full + half, excluding rejected", () => {
    const summary = summarizeLeave([
      entry({ type: "FULL_DAY", days: 2 }),
      entry({ type: "FULL_DAY", days: 1, status: "REJECTED" }),
      entry({ type: "HALF_DAY", days: 0.5 }),
      entry({ type: "HALF_DAY", days: 0.5, status: "PENDING" }),
      entry({ type: "LATE_ARRIVAL", days: 0 }),
      entry({ type: "EARLY_LOGOUT", days: 0 }),
      entry({ type: "WFH", days: 0 }),
      entry({ type: "WFH", days: 0, status: "REJECTED" }),
      entry({ type: null, days: null, status: "PENDING" }),
    ]);
    expect(summary).toEqual({
      leaveDays: 3,
      fullDays: 2,
      halfDays: 2,
      late: 1,
      early: 1,
      wfh: 1,
      pending: 2,
    });
  });

  it("defaults missing day counts (full = 1, half = 0.5)", () => {
    expect(
      summarizeLeave([
        entry({ type: "FULL_DAY", days: null }),
        entry({ type: "HALF_DAY", days: null }),
      ]).leaveDays,
    ).toBe(1.5);
  });

  it("is all zeros for no posts", () => {
    expect(summarizeLeave([]).leaveDays).toBe(0);
  });
});
