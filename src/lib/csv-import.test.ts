import { describe, expect, it } from "vitest";
import {
  cell,
  collectRows,
  parseCsvBoolean,
  parseCsvDate,
  parseCsvFile,
} from "./csv-import";

function formWithCsv(content: string): FormData {
  const formData = new FormData();
  formData.set("file", new File([content], "import.csv", { type: "text/csv" }));
  return formData;
}

describe("parseCsvFile", () => {
  it("parses header CSV into trimmed row objects", async () => {
    const result = await parseCsvFile(
      formWithCsv("name, skillset \nAda, TypeScript\nGrace,COBOL\n"),
    );
    expect(result).toEqual({
      rows: [
        { name: "Ada", skillset: "TypeScript" },
        { name: "Grace", skillset: "COBOL" },
      ],
    });
  });

  it("handles quoted commas and skips empty lines", async () => {
    const result = await parseCsvFile(
      formWithCsv('name,notes\n"Ada, Countess","loves, commas"\n\n'),
    );
    expect(result).toEqual({
      rows: [{ name: "Ada, Countess", notes: "loves, commas" }],
    });
  });

  it("rejects a missing file", async () => {
    expect(await parseCsvFile(new FormData())).toEqual({
      error: "Choose a CSV file to upload",
    });
  });

  it("rejects a CSV with no data rows", async () => {
    expect(await parseCsvFile(formWithCsv("name,skillset\n"))).toEqual({
      error: "CSV has no data rows",
    });
  });
});

describe("collectRows", () => {
  it("splits valid rows from failures with 1-based row numbers", () => {
    const { valid, failures } = collectRows(
      [{ n: "1" }, { n: "x" }, { n: "3" }],
      (row) => {
        const n = Number(row.n);
        if (isNaN(n)) throw new Error("not a number");
        return n;
      },
    );
    expect(valid).toEqual([1, 3]);
    expect(failures).toEqual([{ row: 3, message: "not a number" }]);
  });
});

describe("cell", () => {
  it("treats empty strings and missing keys as undefined", () => {
    expect(cell({ a: "" }, "a")).toBeUndefined();
    expect(cell({}, "a")).toBeUndefined();
    expect(cell({ a: "x" }, "a")).toBe("x");
  });
});

describe("parseCsvDate", () => {
  it("parses ISO dates and rejects garbage", () => {
    expect(parseCsvDate("2026-01-15", "date").getUTCFullYear()).toBe(2026);
    expect(() => parseCsvDate("not-a-date", "date")).toThrow("Invalid date");
    expect(() => parseCsvDate(undefined, "date")).toThrow("date is required");
  });
});

describe("parseCsvBoolean", () => {
  it("only true/yes/1 are true — unlike z.coerce.boolean", () => {
    expect(parseCsvBoolean("true")).toBe(true);
    expect(parseCsvBoolean("YES")).toBe(true);
    expect(parseCsvBoolean("1")).toBe(true);
    expect(parseCsvBoolean("false")).toBe(false);
    expect(parseCsvBoolean("")).toBe(false);
    expect(parseCsvBoolean(undefined)).toBe(false);
  });
});
