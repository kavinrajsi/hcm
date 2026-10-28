import { describe, expect, it } from "vitest";
import {
  EXIT_LETTER_TEMPLATES,
  exitLetterTypesFor,
  fillExitLetterTemplate,
} from "./exit-letters";

const leaver = {
  name: "Asha Rao",
  empId: "MAD-104",
  designation: "Designer",
  department: "Design",
  dateOfJoining: new Date("2025-03-03T00:00:00Z"),
  dateOfExit: new Date("2026-10-27T00:00:00Z"),
};

describe("exitLetterTypesFor", () => {
  it("gives interns only the internship certificate", () => {
    expect(exitLetterTypesFor("INTERN")).toEqual(["INTERNSHIP_CERTIFICATE"]);
  });

  it("gives everyone else the relieving and experience letters", () => {
    for (const empType of ["PERMANENT", "PROBATION", "CONTRACT"]) {
      expect(exitLetterTypesFor(empType)).toEqual(["RELIEVING", "EXPERIENCE"]);
    }
  });
});

describe("fillExitLetterTemplate", () => {
  it("fills every placeholder in every exit template", () => {
    for (const template of Object.values(EXIT_LETTER_TEMPLATES)) {
      const filled = fillExitLetterTemplate(template.body, leaver);
      expect(filled).not.toMatch(/\{\{\s*[\w.]+\s*\}\}/);
      expect(filled).toContain("Asha Rao");
      expect(filled).toContain("MAD-104");
    }
  });

  it("prints joining and exit dates as DD/MM/YYYY", () => {
    const filled = fillExitLetterTemplate(
      EXIT_LETTER_TEMPLATES.RELIEVING.body,
      leaver,
    );
    expect(filled).toContain("03/03/2025");
    expect(filled).toContain("27/10/2026");
  });
});
