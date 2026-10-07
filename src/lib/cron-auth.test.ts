// The overnight window every cron runs in (02:00–08:00 IST).
import { describe, expect, it } from "vitest";
import { inNightWindow } from "./cron-auth";

describe("inNightWindow", () => {
  it("is open from 02:00 IST up to 08:00 IST", () => {
    expect(inNightWindow(new Date("2026-10-07T20:29:00Z"))).toBe(false); // 01:59 IST
    expect(inNightWindow(new Date("2026-10-07T20:30:00Z"))).toBe(true); // 02:00
    expect(inNightWindow(new Date("2026-10-08T02:15:00Z"))).toBe(true); // 07:45
    expect(inNightWindow(new Date("2026-10-08T02:30:00Z"))).toBe(false); // 08:00
    expect(inNightWindow(new Date("2026-10-08T06:00:00Z"))).toBe(false); // 11:30
  });
});
