import { describe, expect, it } from "vitest";
import { toCsv } from "./csv-export";

describe("toCsv", () => {
  it("keeps column order and quotes commas, quotes and newlines", () => {
    const csv = toCsv(["a", "b"], [{ b: 'say "hi", ok', a: "x\ny" }]);
    expect(csv).toBe('a,b\r\n"x\ny","say ""hi"", ok"');
  });

  it("fills missing cells with blanks", () => {
    expect(toCsv(["a", "b"], [{ a: "1" }])).toBe("a,b\r\n1,");
  });

  it("neutralises formula-looking cells", () => {
    expect(toCsv(["a"], [{ a: "=SUM(A1)" }])).toBe("a\r\n'=SUM(A1)");
  });
});
