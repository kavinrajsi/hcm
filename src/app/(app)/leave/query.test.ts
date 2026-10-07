import { describe, expect, it } from "vitest";
import {
  leaveConditions,
  leaveDateRange,
  leaveTotalsConditions,
  leaveTotalsKind,
  leaveTotalsPeriod,
} from "./query";

const yearStart = new Date("2026-01-01T00:00:00Z");
const now = new Date("2026-09-15T06:00:00Z");

describe("leaveConditions", () => {
  it("is empty without filters", () => {
    expect(leaveConditions({})).toEqual([]);
  });

  it("matches any picked type, ORing in unclassified / unmatched", () => {
    expect(leaveConditions({ type: ["FULL_DAY", "wfh"] })).toEqual([
      { type: { in: ["FULL_DAY", "WFH"] } },
    ]);
    expect(leaveConditions({ type: ["UNCLASSIFIED"] })).toEqual([{ type: null }]);
    expect(
      leaveConditions({ type: ["HALF_DAY", "UNCLASSIFIED", "UNMATCHED"] }),
    ).toEqual([
      {
        OR: [
          { type: { in: ["HALF_DAY"] } },
          { type: null },
          { employeeId: null },
        ],
      },
    ]);
  });

  it("ignores unknown types and statuses", () => {
    expect(leaveConditions({ type: ["NAP"], status: ["MAYBE"] })).toEqual([]);
  });

  it("matches any picked status", () => {
    expect(leaveConditions({ status: ["PENDING", "APPROVED"] })).toEqual([
      { status: { in: ["PENDING", "APPROVED"] } },
    ]);
  });

  it("searches names and the message", () => {
    const [search] = leaveConditions({ q: "asha" });
    expect(JSON.stringify(search)).toContain("creatorName");
    expect(JSON.stringify(search)).toContain("message");
  });
});

describe("leaveDateRange", () => {
  it("covers whole days for a custom range", () => {
    expect(leaveDateRange({ from: "2026-03-01", to: "2026-03-31" }, now)).toEqual({
      gte: new Date("2026-03-01T00:00:00Z"),
      lt: new Date("2026-04-01T00:00:00Z"),
    });
  });

  it("covers the month for the month preset", () => {
    expect(leaveDateRange({ date: "month" }, now)).toEqual({
      gte: new Date("2026-09-01T00:00:00Z"),
      lt: new Date("2026-10-01T00:00:00Z"),
    });
  });

  it("is undefined without a date filter", () => {
    expect(leaveDateRange({}, now)).toBeUndefined();
  });
});

describe("leaveTotalsConditions", () => {
  it("defaults to full + half days this year, not rejected", () => {
    expect(leaveTotalsConditions({}, yearStart, now)).toEqual([
      { employeeId: { not: null } },
      { type: { in: ["FULL_DAY", "HALF_DAY"] } },
      { status: { not: "REJECTED" } },
      { startDate: { gte: yearStart } },
    ]);
  });

  it("follows picked day types, statuses and the date range", () => {
    const conditions = leaveTotalsConditions(
      { type: ["HALF_DAY", "WFH"], status: ["APPROVED"], from: "2026-03-01", to: "2026-03-31" },
      yearStart,
      now,
    );
    expect(conditions?.slice(1, 4)).toEqual([
      { type: { in: ["HALF_DAY"] } },
      { status: { in: ["APPROVED"] } },
      {
        OR: [
          { startDate: { gte: new Date("2026-03-01T00:00:00Z"), lt: new Date("2026-04-01T00:00:00Z") } },
          {
            startDate: null,
            postedOn: { gte: new Date("2026-03-01T00:00:00Z"), lt: new Date("2026-04-01T00:00:00Z") },
          },
        ],
      },
    ]);
  });

  it("is null when the type filter picks no full/half-day type", () => {
    expect(leaveTotalsConditions({ type: ["WFH"] }, yearStart, now)).toBeNull();
    expect(leaveTotalsConditions({ type: ["UNCLASSIFIED"] }, yearStart, now)).toBeNull();
    expect(leaveTotalsConditions({ type: ["UNMATCHED"] }, yearStart, now)).toBeNull();
  });

  it("treats unknown type values as no filter", () => {
    expect(leaveTotalsConditions({ type: ["NAP"] }, yearStart, now)?.[1]).toEqual({
      type: { in: ["FULL_DAY", "HALF_DAY"] },
    });
  });
});

describe("leaveTotalsKind", () => {
  it("names the day types being totalled", () => {
    expect(leaveTotalsKind({})).toBe("full + half days");
    expect(leaveTotalsKind({ type: ["FULL_DAY"] })).toBe("full days");
    expect(leaveTotalsKind({ type: ["HALF_DAY", "WFH"] })).toBe("half days");
  });
});

describe("leaveTotalsPeriod", () => {
  it("describes the date filter", () => {
    expect(leaveTotalsPeriod({}, now)).toBe("in 2026");
    expect(leaveTotalsPeriod({ date: "month" }, now)).toBe("this month");
    expect(leaveTotalsPeriod({ date: "year" }, now)).toBe("this year");
    expect(leaveTotalsPeriod({ date: "7d" }, now)).toBe("in the last 7 days");
    expect(leaveTotalsPeriod({ date: "24h" }, now)).toBe("in 2026");
    expect(leaveTotalsPeriod({ from: "2026-03-01", to: "2026-03-31" }, now)).toBe(
      "01/03/2026 – 31/03/2026",
    );
    expect(leaveTotalsPeriod({ from: "2026-03-05", to: "2026-03-05" }, now)).toBe("on 05/03/2026");
    expect(leaveTotalsPeriod({ from: "2026-03-05" }, now)).toBe("from 05/03/2026");
  });
});
