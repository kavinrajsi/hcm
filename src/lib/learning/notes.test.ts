import { describe, expect, it } from "vitest";
import { sanitizeNotes } from "./notes";

describe("sanitizeNotes", () => {
  it("keeps formatting and opens links safely in a new tab", () => {
    expect(sanitizeNotes('<p><strong>Read</strong> <a href="https://x.com">this</a></p>')).toBe(
      '<p><strong>Read</strong> <a href="https://x.com" target="_blank" rel="noopener noreferrer">this</a></p>',
    );
  });

  it("drops scripts, handlers, styles and javascript: links", () => {
    const dirty =
      '<p style="color:red" onclick="steal()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)>';
    const clean = sanitizeNotes(dirty);
    expect(clean).not.toMatch(/script|onclick|onerror|style=|javascript:|<img/);
    expect(clean).toContain("<p>Hi</p>");
  });

  it("treats an emptied editor as no notes", () => {
    expect(sanitizeNotes("<p></p>")).toBe("");
  });
});
