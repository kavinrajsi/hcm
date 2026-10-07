import { describe, expect, it } from "vitest";
import {
  groupByDay,
  isWeekend,
  key,
  monthLinks,
  parseMonth,
  type CalendarEntry,
} from "./leave-calendar";

const utcDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function entry(partial: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: "e1",
    name: "Asha",
    employeeId: null,
    type: "FULL_DAY",
    startDate: null,
    endDate: null,
    postedOn: utcDate("2026-09-01"),
    days: null,
    message: "",
    status: "APPROVED",
    ...partial,
  };
}

describe("parseMonth", () => {
  it("parses YYYY-MM as the 1st of that month (UTC)", () => {
    expect(key(parseMonth("2026-02"))).toBe("2026-02-01");
  });

  it("ignores anything else (e.g. the 1–12 month filter) and uses this month", () => {
    const now = new Date();
    const expected = key(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    );
    expect(key(parseMonth("9"))).toBe(expected);
    expect(key(parseMonth(undefined))).toBe(expected);
  });
});

describe("isWeekend", () => {
  it("flags Saturday and Sunday only", () => {
    expect(isWeekend(utcDate("2026-09-26"))).toBe(true); // Sat
    expect(isWeekend(utcDate("2026-09-27"))).toBe(true); // Sun
    expect(isWeekend(utcDate("2026-09-28"))).toBe(false); // Mon
  });
});

describe("groupByDay", () => {
  it("puts a dateless post on the day it was posted", () => {
    const byDay = groupByDay([entry({ postedOn: utcDate("2026-09-10") })]);
    expect(Object.keys(byDay)).toEqual(["2026-09-10"]);
  });

  it("spreads a range over working days, skipping the weekend", () => {
    // Fri 25 → Tue 29 Sep: 25, 28, 29 (26/27 are the weekend).
    const byDay = groupByDay([
      entry({
        startDate: utcDate("2026-09-25"),
        endDate: utcDate("2026-09-29"),
      }),
    ]);
    expect(Object.keys(byDay)).toEqual([
      "2026-09-25",
      "2026-09-28",
      "2026-09-29",
    ]);
  });

  it("marks only the first and last day when days < the span", () => {
    // "23rd Sep and 16th Oct" is stored as one range with days = 2.
    const byDay = groupByDay([
      entry({
        startDate: utcDate("2026-09-23"),
        endDate: utcDate("2026-10-16"),
        days: 2,
      }),
    ]);
    expect(Object.keys(byDay)).toEqual(["2026-09-23", "2026-10-16"]);
  });

  it("collects several people on the same day", () => {
    const byDay = groupByDay([
      entry({ id: "a", postedOn: utcDate("2026-09-10") }),
      entry({ id: "b", postedOn: utcDate("2026-09-10") }),
    ]);
    expect(byDay["2026-09-10"].map((grouped) => grouped.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("monthLinks", () => {
  it("pages months while keeping filters and the view, dropping page", () => {
    const links = monthLinks(utcDate("2026-01-01"), {
      q: "asha",
      view: "calendar",
      page: "3",
      month: "2026-01",
    });
    const prev = new URL(links.prev, "http://x").searchParams;
    const next = new URL(links.next, "http://x").searchParams;
    expect(prev.get("month")).toBe("2025-12");
    expect(next.get("month")).toBe("2026-02");
    expect(next.get("q")).toBe("asha");
    expect(next.get("view")).toBe("calendar");
    expect(next.has("page")).toBe(false);
  });

  it("keeps every value of a multi-select filter", () => {
    const links = monthLinks(utcDate("2026-01-01"), {
      type: ["FULL_DAY", "WFH"],
      status: "PENDING",
    });
    const next = new URL(links.next, "http://x").searchParams;
    expect(next.getAll("type")).toEqual(["FULL_DAY", "WFH"]);
    expect(next.getAll("status")).toEqual(["PENDING"]);
  });

  it("does not add a view when none was set (phone default strip)", () => {
    const links = monthLinks(utcDate("2026-05-01"), {});
    expect(new URL(links.next, "http://x").searchParams.has("view")).toBe(
      false,
    );
  });

  it("points Today at the current month", () => {
    const now = new Date();
    const expected = key(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    ).slice(0, 7);
    const links = monthLinks(utcDate("2020-01-01"), {});
    expect(new URL(links.today, "http://x").searchParams.get("month")).toBe(
      expected,
    );
  });
});
