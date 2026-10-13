import { describe, expect, it } from "vitest";
import { frameHeight } from "./chat-frame";

describe("frameHeight", () => {
  it("runs from the frame's top to the window's bottom", () => {
    expect(frameHeight(64, 900, 0)).toBe(836); // desktop: under the 64 px header
  });

  it("leaves room for the phone tab bar", () => {
    expect(frameHeight(56, 800, 56)).toBe(688);
  });

  it("never collapses below a usable height (tiny window, keyboard open)", () => {
    expect(frameHeight(56, 200, 56)).toBe(240);
  });
});
