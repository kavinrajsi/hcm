import { describe, expect, it } from "vitest";
import { dayRange, instantRange, parseIstDateTime } from "./date-filter";

// 2026-09-28 04:00 IST
const now = new Date("2026-09-27T22:30:00Z");

describe("parseIstDateTime", () => {
  it("reads wall-clock time as IST", () => {
    expect(parseIstDateTime("2026-09-28T09:30")?.toISOString()).toBe(
      "2026-09-28T04:00:00.000Z",
    );
    expect(parseIstDateTime("2026-09-28")?.toISOString()).toBe(
      "2026-09-27T18:30:00.000Z",
    );
  });

  it("rejects junk", () => {
    expect(parseIstDateTime("yesterday")).toBeUndefined();
    expect(parseIstDateTime("2026-13-45")).toBeUndefined();
  });
});

describe("instantRange", () => {
  it("rolls presets back from now", () => {
    expect(instantRange({ preset: "24h" }, now)?.gte?.toISOString()).toBe(
      "2026-09-26T22:30:00.000Z",
    );
  });

  it("starts this month at IST midnight on the 1st", () => {
    expect(instantRange({ preset: "month" }, now)?.gte?.toISOString()).toBe(
      "2026-08-31T18:30:00.000Z",
    );
  });

  it("makes the end of a custom range inclusive", () => {
    const range = instantRange({
      from: "2026-09-01T00:00",
      to: "2026-09-28T23:59",
    });
    expect(range?.gte?.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(range?.lt?.toISOString()).toBe("2026-09-28T18:30:00.000Z");
    expect(instantRange({ to: "2026-09-28" })?.lt?.toISOString()).toBe(
      "2026-09-28T18:30:00.000Z",
    );
  });

  it("ignores unknown presets and prefers a custom range", () => {
    expect(instantRange({ preset: "forever" })).toBeUndefined();
    expect(
      instantRange(
        { preset: "24h", from: "2026-09-01" },
        now,
      )?.gte?.toISOString(),
    ).toBe("2026-08-31T18:30:00.000Z");
  });
});

describe("dayRange", () => {
  it("covers whole days as UTC midnights", () => {
    const range = dayRange({ from: "2026-09-01", to: "2026-09-16" });
    expect(range?.gte?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(range?.lt?.toISOString()).toBe("2026-09-17T00:00:00.000Z");
  });

  it("uses the IST calendar for presets", () => {
    const month = dayRange({ preset: "month" }, now);
    expect(month?.gte?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(month?.lt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    const week = dayRange({ preset: "7d" }, now);
    expect(week?.gte?.toISOString()).toBe("2026-09-22T00:00:00.000Z");
    expect(week?.lt?.toISOString()).toBe("2026-09-29T00:00:00.000Z");
  });

  it("ignores junk", () => {
    expect(dayRange({ from: "nope" })).toBeUndefined();
    expect(dayRange({ preset: "1h" })).toBeUndefined();
  });
});
