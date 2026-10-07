// Multi-select filter params.
import { describe, expect, it } from "vitest";
import { listParam } from "./table-params";

describe("listParam", () => {
  it("reads one or repeated values, trimmed, blanks dropped", () => {
    expect(listParam("Design")).toEqual(["Design"]);
    expect(listParam([" Design ", "", "Tech"])).toEqual(["Design", "Tech"]);
    expect(listParam(undefined)).toEqual([]);
  });

  it("caps how many values it takes", () => {
    expect(listParam(Array.from({ length: 80 }, (_, index) => `v${index}`))).toHaveLength(50);
  });
});
