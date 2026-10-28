import { describe, expect, it } from "vitest";
import { buildExitLetterPdf, toPdfText } from "./exit-letter-pdf";

describe("toPdfText", () => {
  it("keeps Latin text and replaces characters Helvetica cannot draw", () => {
    expect(toPdfText("Priya — Ñandú “ok”")).toBe("Priya — Ñandú “ok”");
    expect(toPdfText("नमस्ते")).toBe("??????");
  });
});

describe("buildExitLetterPdf", () => {
  it("returns a PDF document", async () => {
    const bytes = await buildExitLetterPdf({
      title: "Relieving letter",
      issuedOn: "28/10/2026",
      paragraphs: ["To whom it may concern,", "Body ".repeat(400)],
      signatory: { name: "HR Head", designation: "HR Manager" },
    });
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
