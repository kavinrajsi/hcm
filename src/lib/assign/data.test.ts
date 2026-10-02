import { beforeEach, describe, expect, it, vi } from "vitest";

// Client Coordinators come from employee designations, not from job creators.

const db = vi.hoisted(() => ({
  employee: { findMany: vi.fn() },
  job: { groupBy: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

const { COORDINATOR_DESIGNATIONS, listCoordinators } = await import("./data");

beforeEach(() => vi.clearAllMocks());

describe("listCoordinators", () => {
  it("asks for current employees with a coordinator designation", async () => {
    db.employee.findMany.mockResolvedValue([]);
    await listCoordinators();
    const where = db.employee.findMany.mock.calls[0][0].where;
    expect(where.dateOfExit).toBeNull();
    expect(where.OR.map((clause: { designation: { equals: string } }) => clause.designation.equals)).toEqual(
      COORDINATOR_DESIGNATIONS,
    );
    expect(COORDINATOR_DESIGNATIONS).toEqual([
      "CGP", "IT Head", "HCM", "Delivery Manager", "CFO", "Founder", "Co-Founder", "Marketing Manager",
    ]);
  });

  it("counts jobs by Basecamp link, most first; unlinked people have none", async () => {
    db.employee.findMany.mockResolvedValue([
      { name: "Jasmine", designation: "HCM", basecampPersonId: "2" },
      { name: "Vikash", designation: "CGP", basecampPersonId: null },
      { name: "Arivukkarasi M", designation: "CGP", basecampPersonId: "1" },
    ]);
    db.job.groupBy.mockResolvedValue([
      { creatorPersonId: "1", _count: { _all: 954 } },
      { creatorPersonId: "2", _count: { _all: 57 } },
    ]);
    expect(await listCoordinators()).toEqual([
      { personId: "1", name: "Arivukkarasi M", designation: "CGP", jobs: 954 },
      { personId: "2", name: "Jasmine", designation: "HCM", jobs: 57 },
      { personId: null, name: "Vikash", designation: "CGP", jobs: 0 },
    ]);
  });
});
