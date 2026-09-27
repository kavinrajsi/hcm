import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
const { buildStats, monthRange } = await import("./recruitment-stats");

describe("monthRange", () => {
  it("lists every month across a year boundary", () => {
    expect(monthRange("2025-11", "2026-02").map((m) => m.key)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});

describe("buildStats", () => {
  const rows = [
    {
      role: "Copywriter",
      position: "Intern",
      status: "New",
      month: "2025-02",
      n: 3,
    },
    {
      role: "Copywriter",
      position: "Full Time",
      status: "Offer",
      month: "2025-04",
      n: 1,
    },
    {
      role: "Graphic Designer",
      position: "Full Time",
      status: "Rejected",
      month: "2025-03",
      n: 5,
    },
    { role: null, position: "Full Time", status: null, month: "2025-03", n: 2 },
  ];
  const s = buildStats(rows, "2025-05");

  it("spans from the first month with data to the current month", () => {
    expect(s.months.map((m) => m.key)).toEqual([
      "2025-02",
      "2025-03",
      "2025-04",
      "2025-05",
    ]);
  });

  it("totals roles, splits Full time / Intern, and sorts by total", () => {
    expect(s.roles.map((r) => [r.role, r.total, r.fullTime, r.intern])).toEqual(
      [
        ["Graphic Designer", 5, 5, 0],
        ["Copywriter", 4, 1, 3],
        ["Unspecified", 2, 2, 0],
      ],
    );
    expect(s.roles[1].byMonth).toEqual([3, 0, 1, 0]);
  });

  it("adds month totals that match the overall total", () => {
    expect(s.monthTotals).toEqual([3, 7, 1, 0]);
    expect(s.total).toBe(11);
  });

  it("counts pipeline stages, treating a missing status as New", () => {
    expect(s.pipeline).toEqual([
      { stage: "New", count: 5 },
      { stage: "Screening", count: 0 },
      { stage: "Interview", count: 0 },
      { stage: "Offer", count: 1 },
    ]);
    expect(s.rejected).toBe(5);
  });

  it("handles no data", () => {
    const empty = buildStats([], "2025-05");
    expect(empty.months).toEqual([]);
    expect(empty.total).toBe(0);
  });
});
