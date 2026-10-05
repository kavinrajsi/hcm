import { describe, expect, it } from "vitest";
import { formatDateTime, formatDay, formatInstantDay, parseIstLocal, toIstLocalInput, istDayKey, istDayStart, formatTime, formatSessionTime, formatWeekdayDay } from "./format-date";

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

describe("Indian-time inputs", () => {
  it("reads a datetime-local value as IST, not server time", () => {
    expect(parseIstLocal("2026-10-05T18:00")?.toISOString()).toBe("2026-10-05T12:30:00.000Z");
    expect(toIstLocalInput(new Date("2026-10-05T12:30:00Z"))).toBe("2026-10-05T18:00");
  });

  it("rejects impossible dates and junk", () => {
    expect(parseIstLocal("2026-02-31T10:00")).toBeNull();
    expect(parseIstLocal("2026-10-05T25:00")).toBeNull();
    expect(parseIstLocal("tomorrow")).toBeNull();
  });

  it("buckets a timestamp into its IST day and back", () => {
    // 20:00 UTC on the 5th is 01:30 on the 6th in India.
    expect(istDayKey(new Date("2026-10-05T20:00:00Z"))).toBe("2026-10-06");
    expect(istDayStart("2026-10-06").toISOString()).toBe("2026-10-05T18:30:00.000Z");
    expect(formatTime(new Date("2026-10-05T12:30:00Z"))).toBe("6:00 pm");
  });
});

describe("session times", () => {
  it("shows the Indian weekday, date and time", () => {
    // 12:30 UTC on Monday 5 October is 6:00 pm in India.
    expect(formatSessionTime(new Date("2026-10-05T12:30:00Z"))).toBe("Mon, 05/10/2026, 6:00 pm IST");
    // 20:00 UTC on Monday is already Tuesday in India.
    expect(formatWeekdayDay(new Date("2026-10-05T20:00:00Z"))).toBe("Tue, 06/10/2026");
    expect(formatSessionTime(null)).toBe("");
  });
});
