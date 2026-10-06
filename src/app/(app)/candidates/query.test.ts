import { describe, expect, it } from "vitest";
import { candidateWhere } from "./query";

describe("candidateWhere", () => {
  it("matches any of several positions, ignoring unknown ones", () => {
    const and = candidateWhere({ position: ["Intern", "Full Time", "Contract"] });
    expect(and).toContainEqual({ position: { in: ["Full Time", "Intern"] } });
  });

  it("matches any of several job roles, case-insensitively", () => {
    const and = candidateWhere({ role: ["Copywriter", " designer "] });
    expect(and).toContainEqual({
      OR: [
        { jobRole: { equals: "Copywriter", mode: "insensitive" } },
        { jobRole: { equals: "designer", mode: "insensitive" } },
      ],
    });
  });

  it("adds nothing for empty selections", () => {
    expect(candidateWhere({ position: [], role: [] })).toHaveLength(1); // just the spam filter
  });

  it("filters by score bands, including not scored", () => {
    const and = candidateWhere({ score: ["strong", "none", "bogus"] });
    expect(and).toContainEqual({
      OR: [
        { score: { is: { score: { gte: 75, lte: 100 } } } },
        { OR: [{ score: { is: null } }, { score: { is: { score: null } } }] },
      ],
    });
  });
});
