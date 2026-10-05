import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  probationRecord: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  employee: { findUnique: vi.fn(), update: vi.fn() },
}));
const db = vi.hoisted(() => ({
  probationRecord: { findUnique: vi.fn(), updateMany: vi.fn() },
}));
const notifyTypeChange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  db: { ...db, $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}));
vi.mock("@/lib/employment-emails", () => ({ notifyTypeChange }));

const { confirmProbationRecord, extendProbationRecord, ProbationStateError } = await import("./hcm-ops");

const open = {
  id: "p1",
  status: { in: ["PENDING", "EXTENDED"] },
  employee: { dateOfExit: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.probationRecord.updateMany.mockResolvedValue({ count: 1 });
  tx.probationRecord.findUniqueOrThrow.mockResolvedValue({ employeeId: "e1" });
  db.probationRecord.findUnique.mockResolvedValue({ dueDate: new Date("2026-10-10T00:00:00Z") });
  db.probationRecord.updateMany.mockResolvedValue({ count: 1 });
});

describe("confirmProbationRecord", () => {
  it("only confirms an open probation of someone still employed", async () => {
    tx.employee.findUnique.mockResolvedValue({ empType: "PROBATION" });
    await confirmProbationRecord("p1");
    expect(tx.probationRecord.updateMany.mock.calls[0][0].where).toEqual(open);
  });

  it("emails the employee when they move to Permanent", async () => {
    tx.employee.findUnique.mockResolvedValue({ empType: "PROBATION" });
    await confirmProbationRecord("p1");
    expect(tx.employee.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { empType: "PERMANENT" } });
    expect(notifyTypeChange).toHaveBeenCalledWith("e1", "PROBATION", "PERMANENT");
  });

  it("stays quiet if they were already Permanent", async () => {
    tx.employee.findUnique.mockResolvedValue({ empType: "PERMANENT" });
    await confirmProbationRecord("p1");
    expect(notifyTypeChange).not.toHaveBeenCalled();
  });

  it("refuses a confirmed or exited record without promoting or emailing", async () => {
    tx.probationRecord.updateMany.mockResolvedValue({ count: 0 });
    await expect(confirmProbationRecord("p1")).rejects.toBeInstanceOf(ProbationStateError);
    expect(tx.employee.update).not.toHaveBeenCalled();
    expect(notifyTypeChange).not.toHaveBeenCalled();
  });
});

describe("extendProbationRecord", () => {
  it("moves the due date of an open probation", async () => {
    await extendProbationRecord("p1", new Date("2026-11-10T00:00:00Z"), "Needs more time");
    const { where, data } = db.probationRecord.updateMany.mock.calls[0][0];
    expect(where).toEqual(open);
    expect(data).toMatchObject({ status: "EXTENDED", notes: "Needs more time" });
    expect(data.dueDate.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });

  it("refuses a date that isn't after the current due date", async () => {
    await expect(extendProbationRecord("p1", new Date("2026-10-10T00:00:00Z"))).rejects.toThrow(
      "after the current due date",
    );
    expect(db.probationRecord.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a confirmed or exited record", async () => {
    db.probationRecord.updateMany.mockResolvedValue({ count: 0 });
    await expect(extendProbationRecord("p1", new Date("2026-11-10T00:00:00Z"))).rejects.toBeInstanceOf(
      ProbationStateError,
    );
  });
});
