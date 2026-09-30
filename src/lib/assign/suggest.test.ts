import { describe, expect, it } from "vitest";
import {
  buildEvidence,
  describeRecord,
  suggest,
  type DesignerHistory,
  type JobEvidence,
} from "./suggest";

const designer = (name: string) => ({
  personId: name.toLowerCase(),
  name,
  title: "Graphic Designer",
  avatarKey: null,
});

let seq = 0;
const job = (
  kind: string,
  corrections: number,
  coordinatorId = "c1",
): JobEvidence => ({
  id: `j${++seq}`,
  title: `Job ${seq}`,
  link: `https://bc/${seq}`,
  bucketName: "Client",
  completedAt: `2026-0${(seq % 9) + 1}-01T00:00:00.000Z`,
  kind,
  coordinatorId,
  coordinatorName: "Coord",
  corrections,
  labelSource: "ai",
});

const history = (name: string, jobs: JobEvidence[]): DesignerHistory => ({
  designer: designer(name),
  jobs,
});

describe("buildEvidence", () => {
  it("keeps only the kind (and coordinator when given), newest first", () => {
    const evidence = buildEvidence(
      history("Asha", [
        job("banner-ad", 0, "c1"),
        job("banner-ad", 2, "c2"),
        job("print", 0, "c1"),
      ]),
      "banner-ad",
      "c1",
    );
    expect(evidence.similar).toHaveLength(1);
    expect(evidence.clean).toBe(1);
    expect(evidence.overall).toEqual({ jobs: 3, clean: 2 });
    expect(describeRecord(evidence)).toBe(
      "1 of 1 similar job needed no correction",
    );
  });
});

describe("suggest", () => {
  it("says so when nobody has enough similar history", () => {
    const result = suggest({
      kind: "packaging",
      coordinatorId: null,
      histories: [
        history("Asha", [job("packaging", 0), job("packaging", 1)]),
        history("Ravi", [job("print", 0)]),
      ],
    });
    expect(result.status).toBe("no-history");
    expect(result.safe).toBeNull();
    expect(result.safeReason).toMatch(/Nobody has 3 or more similar jobs/);
    // Asha still appears as evidence, but not as a pick.
    expect(result.others.map((e) => e.designer.name)).toEqual(["Asha"]);
  });

  it("picks the cleanest record as the safe pick and names ties", () => {
    const result = suggest({
      kind: "social-post",
      coordinatorId: null,
      histories: [
        history("Ravi", [job("social-post", 0), job("social-post", 0), job("social-post", 1)]),
        history("Asha", [job("social-post", 0), job("social-post", 0), job("social-post", 1)]),
        history("Meera", [job("social-post", 1), job("social-post", 2), job("social-post", 0)]),
      ],
    });
    expect(result.status).toBe("ok");
    // Alphabetical input order, equal records: Asha wins the tie, Ravi named.
    expect(result.safe?.designer.name).toBe("Asha");
    expect(result.safeTies.map((d) => d.name)).toEqual(["Ravi"]);
    expect(result.safeReason).toContain("2 of 3 similar jobs needed no correction");
    expect(result.safeReason).toContain("Ravi has the same record");
    expect(result.others.map((e) => e.designer.name)).toEqual(["Meera", "Ravi"]);
  });

  it("prefers more evidence when clean shares tie", () => {
    const result = suggest({
      kind: "website",
      coordinatorId: null,
      histories: [
        history("Asha", [job("website", 0), job("website", 0), job("website", 0)]),
        history("Ravi", [
          job("website", 0),
          job("website", 0),
          job("website", 0),
          job("website", 0),
        ]),
      ],
    });
    expect(result.safe?.designer.name).toBe("Ravi");
    expect(result.safeTies).toEqual([]);
  });

  it("offers a learning pick with the risk spelled out", () => {
    const result = suggest({
      kind: "video",
      coordinatorId: null,
      histories: [
        history("Asha", [job("video", 0), job("video", 0), job("video", 0)]),
        history("Ravi", [
          job("print", 0),
          job("print", 0),
          job("banner-ad", 1),
          job("print", 0),
          job("social-post", 0),
          job("video", 1),
        ]),
        history("Kim", [job("print", 0)]), // too little history overall
      ],
    });
    expect(result.safe?.designer.name).toBe("Asha");
    expect(result.learning?.designer.name).toBe("Ravi");
    expect(result.learningRisk).toContain("Only 1 similar job on record");
    expect(result.learningRisk).toContain("4 of 6 jobs of any kind");
    expect(result.others).toEqual([]);
  });

  it("limits the comparison to one coordinator when asked", () => {
    const result = suggest({
      kind: "print",
      coordinatorId: "c2",
      histories: [
        history("Asha", [job("print", 0, "c1"), job("print", 0, "c1"), job("print", 0, "c1")]),
        history("Ravi", [job("print", 1, "c2"), job("print", 0, "c2"), job("print", 0, "c2")]),
      ],
    });
    expect(result.safe?.designer.name).toBe("Ravi");
    expect(result.safeReason).toContain("under this coordinator");
    // Asha has no jobs under c2, so she isn't even listed as evidence.
    expect(result.others).toEqual([]);
  });
});
