import { describe, expect, it } from "vitest";
import { averageUptime, dayColor, dayKeys, overallState, summarizeDays, summarizeEventDay, uptimePercent } from "./summary";

// 14/10/2026 10:00 IST
const now = new Date("2026-10-14T04:30:00Z");
const at = (iso: string, status: "ok" | "degraded" | "down") => ({ checkedAt: new Date(iso), status });

describe("dayKeys", () => {
  it("lists the last N IST days, oldest first, ending today", () => {
    expect(dayKeys(3, now)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
  });
});

describe("dayColor", () => {
  it("is grey with no checks, green when all fine, yellow when degraded", () => {
    expect(dayColor(0, 0, 0)).toBe("none");
    expect(dayColor(288, 0, 0)).toBe("ok");
    expect(dayColor(288, 3, 0)).toBe("degraded");
  });

  it("is orange for under an hour down and red for an hour or more", () => {
    expect(dayColor(288, 0, 11)).toBe("minor"); // 55 min
    expect(dayColor(288, 0, 12)).toBe("major"); // 60 min
  });
});

describe("summarizeDays", () => {
  it("groups checks by IST day with uptime and minutes", () => {
    const days = summarizeDays(
      [
        at("2026-10-13T19:00:00Z", "ok"), // 00:30 IST on the 14th
        at("2026-10-13T19:05:00Z", "down"),
        at("2026-10-13T10:00:00Z", "degraded"), // 13th
      ],
      2,
      now,
    );
    expect(days).toEqual([
      { day: "2026-10-13", color: "degraded", checks: 1, uptime: 100, degradedMinutes: 5, downMinutes: 0 },
      { day: "2026-10-14", color: "minor", checks: 2, uptime: 50, degradedMinutes: 0, downMinutes: 5 },
    ]);
  });

  it("shows days without checks as no data", () => {
    expect(summarizeDays([], 1, now)[0]).toMatchObject({ color: "none", uptime: null });
  });
});

describe("uptimePercent", () => {
  it("counts degraded as up and rounds down to two decimals", () => {
    expect(uptimePercent([{ status: "ok" }, { status: "degraded" }, { status: "down" }])).toBe(66.66);
    expect(uptimePercent([])).toBeNull();
  });
});

describe("overallState", () => {
  it("is the worst current state", () => {
    expect(overallState(["ok", "ok"])).toBe("operational");
    expect(overallState(["ok", "degraded"])).toBe("degraded");
    expect(overallState(["ok", "ok", "ok", "down"])).toBe("partial");
    expect(overallState(["down", "down", "ok"])).toBe("major");
    expect(overallState([null, null])).toBe("unknown");
  });
});

describe("days from older logs", () => {
  it("colours a day by the share of events that failed", () => {
    expect(summarizeEventDay("2026-10-01", 100, 0, "AI calls")).toMatchObject({ color: "ok", uptime: 100, note: "100 AI calls" });
    expect(summarizeEventDay("2026-10-01", 100, 5, "AI calls")).toMatchObject({ color: "degraded", uptime: 95, note: "100 AI calls, 5 failed" });
    expect(summarizeEventDay("2026-10-01", 10, 3, "AI calls").color).toBe("minor");
    expect(summarizeEventDay("2026-10-01", 10, 6, "AI calls").color).toBe("major");
  });
});

describe("averageUptime", () => {
  it("averages days that have data", () => {
    const days = summarizeDays([at("2026-10-14T01:00:00Z", "ok"), at("2026-10-14T01:05:00Z", "down")], 3, now);
    expect(averageUptime(days)).toBe(50);
    expect(averageUptime(summarizeDays([], 3, now))).toBeNull();
  });
});
