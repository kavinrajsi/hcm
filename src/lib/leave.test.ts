import { describe, expect, it } from "vitest";
import { buildEmailIndex, htmlToText, parseNextLink } from "./leave";

describe("htmlToText", () => {
  it("strips Basecamp rich text to plain lines", () => {
    const html =
      '<p dir="auto">Hi Team,</p><p dir="auto"><br></p><p dir="auto">I&#39;m taking leave on October 6 &amp; 7.</p>' +
      '<bc-attachment sgid="abc" content-type="application/vnd.basecamp.mention"><figure><img src="x"></figure></bc-attachment>';
    expect(htmlToText(html)).toBe("Hi Team,\nI'm taking leave on October 6 & 7.");
  });

  it("handles self-closing attachments and br", () => {
    expect(htmlToText('Late<br>by 11<bc-attachment sgid="x"/>')).toBe("Late\nby 11");
  });
});

describe("buildEmailIndex", () => {
  it("matches work and personal emails case-insensitively, work email wins", () => {
    const index = buildEmailIndex([
      { id: "a", workEmail: "A@madarth.com", personalEmail: "a@gmail.com" },
      { id: "b", workEmail: "b@madarth.com", personalEmail: "a@madarth.com" },
    ]);
    expect(index.get("a@gmail.com")).toBe("a");
    expect(index.get("a@madarth.com")).toBe("a");
    expect(index.get("b@madarth.com")).toBe("b");
  });
});

describe("parseNextLink", () => {
  it("extracts rel=next", () => {
    expect(
      parseNextLink('<https://3.basecampapi.com/1/x.json?page=3>; rel="next"'),
    ).toBe("https://3.basecampapi.com/1/x.json?page=3");
  });
  it("returns null without a next link", () => {
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink('<https://x>; rel="prev"')).toBeNull();
  });
});
