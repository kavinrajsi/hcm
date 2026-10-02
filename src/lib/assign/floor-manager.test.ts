import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { isSuggestionLocked, readFloorManagerId } from "./floor-manager";

describe("readFloorManagerId", () => {
  it("reads the stored user id", () => {
    expect(readFloorManagerId({ userId: "u1" })).toBe("u1");
  });

  it("treats a missing, cleared or malformed setting as not set", () => {
    expect(readFloorManagerId(undefined)).toBeNull();
    expect(readFloorManagerId({ userId: null })).toBeNull();
    expect(readFloorManagerId({ userId: "" })).toBeNull();
    expect(readFloorManagerId("u1")).toBeNull();
  });
});

describe("isSuggestionLocked", () => {
  it("locks the floor manager until he has beliefs", () => {
    expect(isSuggestionLocked("u1", "u1", 0)).toBe(true);
    expect(isSuggestionLocked("u1", "u1", 3)).toBe(false);
  });

  it("never locks anyone else, or anyone when unset", () => {
    expect(isSuggestionLocked("u1", "u2", 0)).toBe(false);
    expect(isSuggestionLocked(null, "u1", 0)).toBe(false);
  });
});
