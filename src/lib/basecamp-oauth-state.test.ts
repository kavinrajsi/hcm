import { describe, expect, it } from "vitest";
import { newState, stateMatches } from "./basecamp-oauth-state";

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
