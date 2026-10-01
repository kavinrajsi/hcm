import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "./safe-redirect";

describe("safeCallbackPath", () => {
  it("keeps same-site paths", () => {
    expect(safeCallbackPath("/d/abc123")).toBe("/d/abc123");
    expect(safeCallbackPath("/devices/x?tab=1")).toBe("/devices/x?tab=1");
  });
  it("rejects anything that could leave the site", () => {
    for (const value of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/ok\r\nSet-Cookie: x",
      undefined,
      ["/d/x"],
    ])
      expect(safeCallbackPath(value)).toBe("/");
  });
});
