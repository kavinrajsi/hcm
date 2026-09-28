import { describe, expect, it } from "vitest";
import { createdRange, parseIstDateTime } from "./created";

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

describe("createdRange", () => {
  it("rolls presets back from now", () => {
    expect(createdRange({ created: "24h" }, now)?.gte?.toISOString()).toBe(
      "2026-09-26T22:30:00.000Z",
    );
  });

  it("starts this month at IST midnight on the 1st", () => {
    expect(createdRange({ created: "month" }, now)?.gte?.toISOString()).toBe(
      "2026-08-31T18:30:00.000Z",
    );
  });

  it("makes the end of a custom range inclusive", () => {
    const r = createdRange({ from: "2026-09-01T00:00", to: "2026-09-28T23:59" });
    expect(r?.gte?.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(r?.lt?.toISOString()).toBe("2026-09-28T18:30:00.000Z");
    expect(createdRange({ to: "2026-09-28" })?.lt?.toISOString()).toBe(
      "2026-09-28T18:30:00.000Z",
    );
  });

  it("ignores unknown presets and prefers a custom range", () => {
    expect(createdRange({ created: "forever" })).toBeUndefined();
    expect(
      createdRange({ created: "24h", from: "2026-09-01" }, now)?.gte?.toISOString(),
    ).toBe("2026-08-31T18:30:00.000Z");
  });
});
