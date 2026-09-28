import { describe, expect, it } from "vitest";
import { isBlankHtml, toEmailHtml } from "./email-html";

describe("toEmailHtml", () => {
  it("strips scripts, handlers, classes, images and unsafe links", () => {
    const out = toEmailHtml(
      `<p class="x" onclick="alert(1)">Hi</p><script>alert(1)</script>` +
        `<img src="x"><a href="javascript:alert(1)">bad</a>` +
        `<a href="https://madarth.com">ok</a><iframe src="x"></iframe>`,
    );
    expect(out).not.toMatch(/script|onclick|class=|<img|javascript:|iframe/);
    expect(out).toContain('href="https://madarth.com"');
    expect(out).toContain('target="_blank"');
  });

  it("keeps colour and alignment, drops other styles", () => {
    const out = toEmailHtml(
      `<p style="text-align:center;position:absolute">A <span style="color:#dc2626;background:url(x)">red</span></p>`,
    );
    expect(out).toContain("text-align:center");
    expect(out).toContain("color:#dc2626");
    expect(out).not.toMatch(/position|url\(/);
  });

  it("adds inline email defaults once, even when run twice", () => {
    const once = toEmailHtml(
      "<p>Hello</p><table><tbody><tr><td>x</td></tr></tbody></table>",
    );
    expect(once).toContain('<p style="margin:0 0 12px">Hello</p>');
    expect(once).toContain("border:1px solid #e4e4e7");
    expect(once).toContain('cellpadding="0"');
    expect(toEmailHtml(once)).toBe(once);
  });

  it("flattens paragraphs in table cells and list items", () => {
    const out = toEmailHtml(
      "<table><tbody><tr><td><p>a</p><p>b</p></td></tr></tbody></table><ul><li><p>one</p></li></ul>",
    );
    expect(out).toMatch(/<td[^>]*>a<br \/>b<\/td>/);
    expect(out).toMatch(/<li[^>]*>one<\/li>/);
    expect(out).not.toContain("<colgroup");
    expect(
      toEmailHtml("<table><tbody><tr><td><p></p></td></tr></tbody></table>"),
    ).toMatch(/<td[^>]*>(&nbsp;|\u00a0)<\/td>/);
  });

  it("turns highlights into email-safe spans and keeps placeholders", () => {
    const out = toEmailHtml(
      '<p>Dear {{name}}, <mark data-color="#bbf7d0" style="background-color: #bbf7d0; color: inherit">welcome</mark></p>',
    );
    expect(out).toContain("{{name}}");
    expect(out).toContain(
      '<span style="background-color:#bbf7d0">welcome</span>',
    );
    expect(out).not.toContain("<mark");
  });
});

describe("isBlankHtml", () => {
  it("detects an empty editor", () => {
    expect(isBlankHtml("<p></p><p>&nbsp;</p>")).toBe(true);
    expect(isBlankHtml("<p>Hi</p>")).toBe(false);
  });
});
