import { describe, expect, it } from "vitest";
import { cleanNoteHtml, plainNoteText } from "./note-html";

describe("cleanNoteHtml", () => {
  it("keeps the editor's formatting and drops scripts", () => {
    expect(cleanNoteHtml('<p><strong>Call</strong> back</p><script>x()</script>')).toBe(
      "<p><strong>Call</strong> back</p>",
    );
  });

  it("drops unsafe links and marks safe ones", () => {
    const html = cleanNoteHtml('<a href="javascript:alert(1)">bad</a><a href="https://x.com">ok</a>');
    expect(html).not.toMatch(/javascript:/);
    expect(html).toContain('href="https://x.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("escapes plain-text notes so they show as typed", () => {
    expect(cleanNoteHtml("Salary < 5 & notice")).toBe("Salary &lt; 5 &amp; notice");
  });
});

describe("plainNoteText", () => {
  it("strips tags for search and MadMax", () => {
    expect(plainNoteText("<ul><li>Portfolio <b>ok</b></li></ul>")).toBe("Portfolio ok");
  });
});
