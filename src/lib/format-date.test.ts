import { describe, expect, it } from "vitest";
import { formatDateTime, formatDay, formatInstantDay } from "./format-date";

describe("Indian date format", () => {
  it("formats calendar dates as DD/MM/YYYY", () => {
    expect(formatDay(new Date("2026-09-28T00:00:00Z"))).toBe("28/09/2026");
    expect(formatDay("2026-01-05")).toBe("05/01/2026");
    expect(formatDay(null)).toBe("");
    expect(formatDay("soon")).toBe("");
  });

  it("uses the IST day for timestamps", () => {
    // 20:00 UTC on the 27th is 01:30 IST on the 28th.
    expect(formatInstantDay(new Date("2026-09-27T20:00:00Z"))).toBe(
      "28/09/2026",
    );
  });

  it("adds a 12-hour IST time", () => {
    expect(formatDateTime(new Date("2026-09-28T06:14:02Z"))).toBe(
      "28/09/2026, 11:44 am",
    );
    expect(formatDateTime(new Date("2026-09-28T18:30:00Z"))).toBe(
      "29/09/2026, 12:00 am",
    );
    expect(formatDateTime(new Date("2026-09-28T09:30:00Z"))).toBe(
      "28/09/2026, 3:00 pm",
    );
  });
});
