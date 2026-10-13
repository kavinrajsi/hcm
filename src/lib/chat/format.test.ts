import { describe, expect, it } from "vitest";
import { chatAvatarColor, chatDayLabel, chatListTime, senderColor } from "./format";

// 13/10/2026 10:00 IST
const now = new Date("2026-10-13T04:30:00Z");

describe("chat date labels", () => {
  it("names today and yesterday in IST", () => {
    expect(chatDayLabel(new Date("2026-10-12T19:00:00Z"), now)).toBe("Today"); // 00:30 IST on the 13th
    expect(chatDayLabel(new Date("2026-10-12T18:00:00Z"), now)).toBe("Yesterday"); // 23:30 IST on the 12th
    expect(chatDayLabel(new Date("2026-10-01T06:00:00Z"), now)).toBe("01/10/2026");
  });

  it("shows a time for today in the chat list, else the day", () => {
    expect(chatListTime(new Date("2026-10-13T03:30:00Z"), now)).toMatch(/9:00\s?am/i);
    expect(chatListTime(new Date("2026-10-12T06:00:00Z"), now)).toBe("Yesterday");
    expect(chatListTime(new Date("2024-08-29T04:02:00Z"), now)).toBe("29/08/2024");
    expect(chatListTime(null, now)).toBe("");
  });
});

describe("colours", () => {
  it("gives a person the same name colour every time, by id or name", () => {
    expect(senderColor("77", "Ravi")).toBe(senderColor("77", "Ravi Kumar"));
    expect(senderColor(null, "Guest")).toBe(senderColor(null, "Guest"));
    expect(senderColor("77", "x")).toMatch(/^text-/);
  });

  it("spreads people across colours", () => {
    const colours = new Set(Array.from({ length: 40 }, (_, index) => senderColor(String(index), "")));
    expect(colours.size).toBeGreaterThan(4);
  });

  it("keeps a project's avatar colour steady", () => {
    expect(chatAvatarColor("123")).toBe(chatAvatarColor("123"));
    expect(chatAvatarColor("123")).toMatch(/^bg-/);
  });
});
