import { describe, expect, it } from "vitest";
import { bucketKey, bucketLabel, bucketSpan, dateBounds, instantBounds, previousRange, resolveRange, weekStart } from "./time";

// 14/10/2026 22:00 IST (a Wednesday) = 16:30 UTC.
const now = new Date("2026-10-14T16:30:00Z");

describe("resolveRange", () => {
  it("uses IST days, not UTC", () => {
    // 15/10 01:00 IST is still 14/10 in UTC.
    expect(resolveRange({ preset: "today" }, new Date("2026-10-14T19:30:00Z"))).toEqual({ from: "2026-10-15", to: "2026-10-16" });
  });

  it("covers calendar months, including the current one for last N months", () => {
    expect(resolveRange({ preset: "this-month" }, now)).toEqual({ from: "2026-10-01", to: "2026-11-01" });
    expect(resolveRange({ preset: "last-month" }, now)).toEqual({ from: "2026-09-01", to: "2026-10-01" });
    expect(resolveRange({ preset: "last-3-months" }, now)).toEqual({ from: "2026-08-01", to: "2026-11-01" });
    expect(resolveRange({ preset: "last-12-months" }, now)).toEqual({ from: "2025-11-01", to: "2026-11-01" });
    expect(resolveRange({ preset: "this-year" }, now)).toEqual({ from: "2026-01-01", to: "2027-01-01" });
  });

  it("weeks start on Monday", () => {
    expect(weekStart("2026-10-14")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(resolveRange({ preset: "this-week" }, now)).toEqual({ from: "2026-10-12", to: "2026-10-19" });
  });

  it("handles open and custom ranges", () => {
    expect(resolveRange({ preset: "all" }, now)).toEqual({});
    expect(resolveRange({ preset: "to-month-end" }, now)).toEqual({ to: "2026-11-01" });
    expect(resolveRange({ preset: "upcoming" }, now)).toEqual({ from: "2026-10-14", fromNow: now });
    // "To" is inclusive.
    expect(resolveRange({ preset: "custom", from: "2026-01-05", to: "2026-01-10" }, now)).toEqual({ from: "2026-01-05", to: "2026-01-11" });
  });
});

describe("previousRange", () => {
  it("steps back whole months for month presets", () => {
    expect(previousRange({ preset: "this-month" }, now)).toEqual({ from: "2026-09-01", to: "2026-10-01" });
    expect(previousRange({ preset: "last-3-months" }, now)).toEqual({ from: "2026-05-01", to: "2026-08-01" });
  });

  it("steps back the same number of days otherwise, and has none for open ranges", () => {
    expect(previousRange({ preset: "this-week" }, now)).toEqual({ from: "2026-10-05", to: "2026-10-12" });
    expect(previousRange({ preset: "all" }, now)).toBeNull();
    expect(previousRange({ preset: "upcoming" }, now)).toBeNull();
  });
});

describe("bounds", () => {
  it("date columns use UTC midnight, timestamps IST midnight", () => {
    const range = { from: "2026-10-01", to: "2026-11-01" };
    expect(dateBounds(range)).toEqual({ gte: new Date("2026-10-01T00:00:00Z"), lt: new Date("2026-11-01T00:00:00Z") });
    expect(instantBounds(range)).toEqual({ gte: new Date("2026-09-30T18:30:00Z"), lt: new Date("2026-10-31T18:30:00Z") });
    expect(dateBounds({})).toBeUndefined();
  });

  it("'upcoming' timestamps start now", () => {
    expect(instantBounds({ from: "2026-10-14", fromNow: now })).toEqual({ gte: now });
  });
});

describe("buckets", () => {
  it("keys and labels", () => {
    expect(bucketKey("2026-10-14", "month")).toBe("2026-10");
    expect(bucketKey("2026-10-14", "quarter")).toBe("2026-Q4");
    expect(bucketKey("2026-10-14", "week")).toBe("2026-10-12");
    expect(bucketLabel("2026-10", "month")).toBe("Oct 26");
    expect(bucketLabel("2026-Q4", "quarter")).toBe("Q4 2026");
    expect(bucketLabel("2026-10-12", "week")).toBe("Wk 12/10");
  });

  it("spans fill every period", () => {
    expect(bucketSpan("2026-08-15", "2026-10-02", "month")).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(bucketSpan("2026-02-10", "2026-10-02", "quarter")).toEqual(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]);
    expect(bucketSpan("2026-10-14", "2026-10-27", "week")).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
  });
});
