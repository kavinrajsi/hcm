import { describe, expect, it } from "vitest";
import { plainTextToHtml, previewText, sanitizeChatHtml, toChatLineRow } from "./lines";

describe("sanitizeChatHtml", () => {
  it("drops scripts, iframes, styles and event handlers", () => {
    const html = sanitizeChatHtml(
      '<div onclick="x()">Hi<script>alert(1)</script><iframe src="https://evil.example"></iframe><img src="https://x/y.png" onerror="x()"></div>',
    );
    expect(html).toBe('<div>Hi<img src="https://x/y.png" /></div>');
  });

  it("keeps links (opening in a new tab) and only https images", () => {
    expect(sanitizeChatHtml('<a href="https://madarth.com">site</a>')).toBe(
      '<a href="https://madarth.com" target="_blank" rel="noopener noreferrer">site</a>',
    );
    expect(sanitizeChatHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a target=\"_blank\" rel=\"noopener noreferrer\">x</a>");
    expect(sanitizeChatHtml('<img src="http://plain.example/a.png">')).toBe("<img />");
  });

  it("keeps a mention's text and turns big text into bold", () => {
    expect(sanitizeChatHtml('<bc-attachment sgid="x" content-type="application/vnd.basecamp.mention">Ravi</bc-attachment> hi')).toBe("Ravi hi");
    expect(sanitizeChatHtml("<h1>Done</h1>")).toBe("<strong>Done</strong>");
  });
});

describe("previewText", () => {
  it("is plain, single-line and short", () => {
    expect(previewText("<div>Hello<br>there &amp; <strong>everyone</strong></div>")).toBe("Hello there & everyone");
    expect(previewText(`<p>${"a".repeat(200)}</p>`)).toHaveLength(120);
  });

  it("falls back to the file name for uploads", () => {
    expect(previewText("", [{ name: "brief.pdf", contentType: null, size: null, url: null }])).toBe("📎 brief.pdf");
  });
});

describe("toChatLineRow", () => {
  it("maps a line with its creator and files", () => {
    const row = toChatLineRow("9", {
      id: 5,
      type: "Chat::Lines::Upload",
      created_at: "2026-10-13T04:00:00.000Z",
      content: "",
      creator: { id: 77, name: "Ravi" },
      attachments: [{ title: "brief.pdf", content_type: "application/pdf", byte_size: 2048, download_url: "https://bc/x" }],
    });
    expect(row).toMatchObject({
      basecampId: "5",
      chatBasecampId: "9",
      creatorPersonId: "77",
      creatorName: "Ravi",
      attachments: [{ name: "brief.pdf", contentType: "application/pdf", size: 2048, url: "https://bc/x" }],
      preview: "📎 brief.pdf",
    });
  });
});

describe("plainTextToHtml", () => {
  it("escapes what people type and keeps line breaks", () => {
    expect(plainTextToHtml('<b>hi</b> & "you"\nnext')).toBe("<div>&lt;b&gt;hi&lt;/b&gt; &amp; &quot;you&quot;<br>next</div>");
  });
});
