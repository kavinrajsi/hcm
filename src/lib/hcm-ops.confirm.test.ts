import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  probationRecord: { update: vi.fn() },
  employee: { findUnique: vi.fn(), update: vi.fn() },
}));
const notifyTypeChange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } }));
vi.mock("@/lib/employment-emails", () => ({ notifyTypeChange }));

const { confirmProbationRecord } = await import("./hcm-ops");

beforeEach(() => {
  vi.clearAllMocks();
  tx.probationRecord.update.mockResolvedValue({ employeeId: "e1" });
});

describe("confirmProbationRecord", () => {
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
});
