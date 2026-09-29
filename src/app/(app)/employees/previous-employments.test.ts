import { describe, expect, it, vi } from "vitest";

// Parsing the employee form's previous-company rows (prevCount + prev.{i}.*).

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/blob", () => ({ uploadDocument: vi.fn() }));

const { parsePreviousEmployments, MAX_PREVIOUS_COMPANIES } =
  await import("./previous-employments");

function form(fields: Record<string, string | File>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

const pdf = (bytes: number) =>
  new File([new Uint8Array(bytes)], "letter.pdf", { type: "application/pdf" });

describe("parsePreviousEmployments", () => {
  it("leaves rows alone when the section wasn't posted", () => {
    expect(parsePreviousEmployments(form({}))).toEqual({});
  });

  it("reads names, ids and letters in order", () => {
    const offer = pdf(10);
    const result = parsePreviousEmployments(
      form({
        prevCount: "2",
        "prev.0.id": "pe1",
        "prev.0.companyName": "  Acme  ",
        "prev.1.companyName": "Globex",
        "prev.1.offerLetter": offer,
      }),
    );
    expect(result.fieldErrors).toBeUndefined();
    expect(result.rows).toHaveLength(2);
    expect(result.rows?.[0]).toMatchObject({
      id: "pe1",
      companyName: "Acme",
      files: {},
    });
    expect(result.rows?.[1].companyName).toBe("Globex");
    expect(result.rows?.[1].id).toBeUndefined();
    expect(result.rows?.[1].files.offerLetter).toBeInstanceOf(File);
  });

  it("drops an untouched empty row", () => {
    const result = parsePreviousEmployments(
      form({ prevCount: "2", "prev.0.companyName": "Acme" }),
    );
    expect(result.rows).toEqual([
      expect.objectContaining({ companyName: "Acme" }),
    ]);
  });

  it("an empty list clears every company", () => {
    expect(parsePreviousEmployments(form({ prevCount: "0" }))).toEqual({
      rows: [],
    });
  });

  it("requires a company name once a letter is attached", () => {
    const result = parsePreviousEmployments(
      form({ prevCount: "1", "prev.0.relievingLetter": pdf(10) }),
    );
    expect(result.rows).toBeUndefined();
    expect(result.fieldErrors).toEqual({
      "prev.0.companyName": ["Company name is required"],
    });
  });

  it("rejects letters over 10 MB", () => {
    const result = parsePreviousEmployments(
      form({
        prevCount: "1",
        "prev.0.companyName": "Acme",
        "prev.0.experienceLetter": pdf(10 * 1024 * 1024 + 1),
      }),
    );
    expect(result.fieldErrors).toEqual({
      "prev.0.experienceLetter": ["Exceeds the 10 MB limit"],
    });
  });

  it("caps the number of companies", () => {
    const result = parsePreviousEmployments(
      form({ prevCount: String(MAX_PREVIOUS_COMPANIES + 1) }),
    );
    expect(result.fieldErrors?.previousEmployments).toBeDefined();
  });
});
