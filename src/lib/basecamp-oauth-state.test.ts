import { describe, expect, it } from "vitest";
import { newState, safeReturnPath, stateMatches } from "./basecamp-oauth-state";

describe("Basecamp OAuth state", () => {
  it("is long and random", () => {
    const state = newState();
    expect(state).toMatch(/^[\w-]{43}$/);
    expect(newState()).not.toBe(state);
  });

  it("only matches the exact value from this browser's cookie", () => {
    const state = newState();
    expect(stateMatches(state, state)).toBe(true);
    expect(stateMatches(state, newState())).toBe(false);
    expect(stateMatches(undefined, state)).toBe(false);
    expect(stateMatches(state, null)).toBe(false);
    expect(stateMatches(state, `${state}x`)).toBe(false);
  });
});

describe("safeReturnPath", () => {
  it("allows Leave and Chat pages", () => {
    expect(safeReturnPath("/chat")).toBe("/chat");
    expect(safeReturnPath("/chat/123")).toBe("/chat/123");
    expect(safeReturnPath("/leave")).toBe("/leave");
  });
  it("falls back to Leave for anything else", () => {
    expect(safeReturnPath(undefined)).toBe("/leave");
    expect(safeReturnPath("/admin")).toBe("/leave");
    expect(safeReturnPath("//evil.example")).toBe("/leave");
    expect(safeReturnPath("https://evil.example/chat")).toBe("/leave");
    expect(safeReturnPath("/chat/../admin")).toBe("/leave");
    expect(safeReturnPath("/chatroom")).toBe("/leave");
  });
});
