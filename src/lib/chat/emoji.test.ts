import { describe, expect, it } from "vitest";
import { EMOJI_GROUPS, recentEmoji, rememberEmoji } from "./emoji";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};

describe("emoji", () => {
  it("has six tabs of emoji with no blanks", () => {
    expect(EMOJI_GROUPS).toHaveLength(6);
    for (const group of EMOJI_GROUPS) expect(group.emoji.every((emoji) => emoji.trim().length > 0)).toBe(true);
    expect(EMOJI_GROUPS.reduce((total, group) => total + group.emoji.length, 0)).toBeGreaterThan(150);
  });

  it("keeps recent emoji newest first without repeats", () => {
    const store = memory();
    rememberEmoji("👍", store);
    rememberEmoji("🎉", store);
    expect(rememberEmoji("👍", store)).toEqual(["👍", "🎉"]);
    expect(recentEmoji(store)).toEqual(["👍", "🎉"]);
  });

  it("copes with storage that throws or holds junk", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(recentEmoji(broken)).toEqual([]);
    expect(rememberEmoji("👍", broken)).toEqual(["👍"]);
    expect(recentEmoji({ getItem: () => "{oops", setItem: () => {} })).toEqual([]);
    expect(recentEmoji(null)).toEqual([]);
  });
});
