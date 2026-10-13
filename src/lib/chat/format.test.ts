import { describe, expect, it } from "vitest";
import { chatDayLabel, chatListTime } from "./format";

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
