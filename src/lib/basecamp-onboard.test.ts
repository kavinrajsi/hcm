import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn(), updateMany: vi.fn() },
}));
const basecamp = vi.hoisted(() => ({
  generalProjectConfig: () => ({ accountId: "3251537", projectId: "1710547" }),
  getAccessToken: vi.fn(),
  listPeople: vi.fn(),
  listProjectPeople: vi.fn(),
  updateProjectAccess: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/basecamp", () => basecamp);
vi.mock("@/lib/leave-sync", () => ({ leaveSyncUserId: vi.fn(async () => "hr") }));

const { addEmployeeToBasecamp } = await import("./basecamp-onboard");

const person = (id: number, email: string) => ({ id, name: "X", email_address: email });

beforeEach(() => {
  vi.clearAllMocks();
  db.employee.findUnique.mockResolvedValue({
    name: "Asha Rao",
    workEmail: "Asha@Madarth.com",
    designation: "Designer",
    dateOfExit: null,
  });
  db.employee.updateMany.mockResolvedValue({ count: 1 });
  basecamp.getAccessToken.mockResolvedValue({ accessToken: "t", accountId: "a" });
  basecamp.listProjectPeople.mockResolvedValue([]);
  basecamp.listPeople.mockResolvedValue([]);
  basecamp.updateProjectAccess.mockResolvedValue({ granted: [person(77, "asha@madarth.com")] });
});

describe("addEmployeeToBasecamp", () => {
  it("invites someone new to Basecamp into All-General Stuffs", async () => {
    const result = await addEmployeeToBasecamp("e1");
    expect(basecamp.updateProjectAccess).toHaveBeenCalledWith("t", "3251537", "1710547", {
      create: [
        { name: "Asha Rao", email_address: "asha@madarth.com", title: "Designer", company_name: "Madarth" },
      ],
    });
    expect(result).toEqual({ status: "invited", personId: "77" });
    expect(db.employee.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { basecampPersonId: "77" } }),
    );
  });

  it("adds an existing Basecamp person to the project without inviting", async () => {
    basecamp.listPeople.mockResolvedValue([person(55, "ASHA@madarth.com")]);
    basecamp.updateProjectAccess.mockResolvedValue({ granted: [person(55, "asha@madarth.com")] });
    const result = await addEmployeeToBasecamp("e1");
    expect(basecamp.updateProjectAccess).toHaveBeenCalledWith("t", "3251537", "1710547", { grant: [55] });
    expect(result).toEqual({ status: "added", personId: "55" });
  });

  it("does nothing when they're already in the project", async () => {
    basecamp.listProjectPeople.mockResolvedValue([person(55, "asha@madarth.com")]);
    const result = await addEmployeeToBasecamp("e1");
    expect(basecamp.updateProjectAccess).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "already", personId: "55" });
  });

  it("skips when Basecamp isn't connected, and reports a failed call", async () => {
    basecamp.getAccessToken.mockResolvedValue(null);
    expect((await addEmployeeToBasecamp("e1")).status).toBe("skipped");
    basecamp.getAccessToken.mockResolvedValue({ accessToken: "t", accountId: "a" });
    basecamp.updateProjectAccess.mockRejectedValue(new Error("Basecamp access update failed: 403"));
    expect(await addEmployeeToBasecamp("e1")).toEqual({
      status: "failed",
      reason: "Basecamp access update failed: 403",
    });
  });

  it("skips someone who has left", async () => {
    db.employee.findUnique.mockResolvedValue({
      name: "X",
      workEmail: "x@madarth.com",
      designation: "D",
      dateOfExit: new Date("2020-01-01"),
    });
    expect((await addEmployeeToBasecamp("e1")).status).toBe("skipped");
    expect(basecamp.updateProjectAccess).not.toHaveBeenCalled();
  });
});
