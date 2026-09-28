import { describe, expect, it } from "vitest";
import {
  addDaysToDay,
  hasTypeEnd,
  resolveTypeEnd,
  typeEndDefault,
  typeEndUpdateData,
} from "./type-end";

const day = (value: string) => new Date(`${value}T00:00:00Z`);

describe("type end dates", () => {
  it("defaults to 90 days, across month and year boundaries", () => {
    expect(typeEndDefault(day("2026-09-28")).toISOString().slice(0, 10)).toBe(
      "2026-12-27",
    );
    expect(typeEndDefault(day("2026-11-15")).toISOString().slice(0, 10)).toBe(
      "2027-02-13",
    );
    expect(addDaysToDay("2026-09-28", 90)).toBe("2026-12-27");
    expect(addDaysToDay("", 90)).toBe("");
    expect(addDaysToDay("2026-13-40", 90)).toBe("");
  });

  it("uses the submitted date, else the default", () => {
    expect(resolveTypeEnd("2027-01-31", day("2026-09-28"))).toEqual(
      day("2027-01-31"),
    );
    expect(resolveTypeEnd(undefined, day("2026-09-28"))).toEqual(
      day("2026-12-27"),
    );
    expect(resolveTypeEnd("soon", day("2026-09-28"))).toEqual(
      day("2026-12-27"),
    );
  });

  it("knows which types have an end date", () => {
    expect(["INTERN", "PROBATION", "CONTRACT"].every(hasTypeEnd)).toBe(true);
    expect(hasTypeEnd("PERMANENT")).toBe(false);
  });
});

describe("typeEndUpdateData", () => {
  const endDate = day("2026-12-27");

  it("stores intern and contract ends on the employee", () => {
    expect(
      typeEndUpdateData({
        empType: "CONTRACT",
        previousType: "PERMANENT",
        endDate,
        probation: null,
      }),
    ).toEqual({ empTypeEndsOn: endDate });
  });

  it("confirms an open probation when made permanent", () => {
    const update = typeEndUpdateData({
      empType: "PERMANENT",
      previousType: "PROBATION",
      endDate,
      probation: { status: "PENDING" },
    });
    expect(update.probation).toEqual({
      update: { status: "CONFIRMED", confirmedAt: expect.any(Date) },
    });
  });

  it("clears the end date for permanent employees", () => {
    expect(
      typeEndUpdateData({
        empType: "PERMANENT",
        previousType: "CONTRACT",
        endDate,
        probation: null,
      }),
    ).toEqual({ empTypeEndsOn: null });
  });

  it("opens a probation record when there is none", () => {
    expect(
      typeEndUpdateData({
        empType: "PROBATION",
        previousType: "INTERN",
        endDate,
        probation: null,
      }),
    ).toEqual({
      empTypeEndsOn: null,
      probation: { create: { dueDate: endDate } },
    });
  });

  it("reopens a confirmed record when switching into probation", () => {
    expect(
      typeEndUpdateData({
        empType: "PROBATION",
        previousType: "PERMANENT",
        endDate,
        probation: { status: "CONFIRMED" },
      }).probation,
    ).toEqual({
      update: {
        dueDate: endDate,
        status: "PENDING",
        extendedTo: null,
        confirmedAt: null,
      },
    });
  });

  it("only moves the due date on an ongoing probation", () => {
    expect(
      typeEndUpdateData({
        empType: "PROBATION",
        previousType: "PROBATION",
        endDate,
        probation: { status: "EXTENDED" },
      }).probation,
    ).toEqual({ update: { dueDate: endDate } });
  });
});
