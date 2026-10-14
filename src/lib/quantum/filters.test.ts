import { describe, expect, it } from "vitest";
import { quantumFilters } from "./filters";

const today = "2026-10-14";

describe("quantumFilters", () => {
  it("keeps trashed to-dos out and scopes non-team viewers to their own", () => {
    expect(quantumFilters({}, { today, isTeamView: true, myPersonId: null }).visible).toEqual({ status: { not: "trashed" } });
    expect(quantumFilters({}, { today, isTeamView: false, myPersonId: "5" }).visible).toEqual({
      status: { not: "trashed" },
      assigneeIds: { has: "5" },
    });
  });

  it("turns URL filters into conditions, keeping who/when apart for the timesheet", () => {
    const filters = quantumFilters(
      { q: "logo", project: ["7"], type: "Kanban::Card", status: "completed", person: "9", day: "7d" },
      { today, isTeamView: true, myPersonId: null },
    );
    expect(filters.withoutPeopleOrDates).toHaveLength(5); // visible, search, project, type, status
    expect(filters.and).toHaveLength(7); // + person + dates
    expect(filters.people).toEqual(["9"]);
    expect(filters.days).toBeDefined();
  });

  it("ignores unknown types and statuses", () => {
    const filters = quantumFilters({ type: "Nope", status: "weird" }, { today, isTeamView: true, myPersonId: null });
    expect(filters.kinds).toEqual([]);
    expect(filters.statuses).toEqual([]);
    expect(filters.and).toHaveLength(1);
  });
});
