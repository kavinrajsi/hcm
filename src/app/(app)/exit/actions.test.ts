import { beforeEach, describe, expect, it, vi } from "vitest";

// markExit / undoExit against a mocked database: what an exit closes (ID
// card, probation, login) and what undo restores.

const db = vi.hoisted(() => {
  const mockDb = {
    employee: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    idCard: { update: vi.fn() },
    idCardStatusChange: { findFirst: vi.fn() },
    probationRecord: { update: vi.fn() },
    device: { findMany: vi.fn<(args: { where: unknown }) => Promise<unknown[]>>(async () => []) },
    $transaction: vi.fn(),
  };
  // Array form: run the queued updates; callback form: hand over the mock.
  mockDb.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg)
      ? Promise.all(arg)
      : (arg as (transaction: typeof mockDb) => unknown)(mockDb),
  );
  return mockDb;
});
const sendEmail = vi.hoisted(() =>
  vi.fn<(email: { html: string }) => Promise<{ skipped: boolean }>>(async () => ({ skipped: true })),
);

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { markExit, undoExit } = await import("./actions");

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

const baseEmployee = {
  id: "e1",
  name: "Asha",
  empId: "E1",
  workEmail: "asha@x.com",
  dateOfExit: null,
  userId: "u1",
  idCard: { id: "c1", status: "ISSUED" },
  probation: { id: "p1", status: "PENDING", extendedTo: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg)
      ? Promise.all(arg)
      : (arg as (transaction: typeof db) => unknown)(db),
  );
});

describe("markExit", () => {
  it("lists the leaver's devices to collect, in the result and the clearance email", async () => {
    db.employee.findUnique.mockResolvedValue(baseEmployee);
    db.user.findUnique.mockResolvedValue({ role: "EMPLOYEE" });
    db.device.findMany.mockResolvedValueOnce([
      { type: "LAPTOP", brand: "Apple", model: "MacBook Air", assetTag: "MAD-LAP-E1" },
    ]);

    const result = await markExit({}, form({ employeeId: "e1", dateOfExit: "2026-10-01" }));

    expect(db.device.findMany.mock.calls[0][0].where).toEqual({ holderId: "e1" });
    expect(result.ok).toBe("Exit recorded. Collect 1 device: MAD-LAP-E1 — then mark it returned on Devices.");
    expect(sendEmail.mock.calls[0][0].html).toContain("Apple MacBook Air (MAD-LAP-E1)");
  });

  it("records the exit and closes card, probation and login", async () => {
    db.employee.findUnique.mockResolvedValue(baseEmployee);
    db.user.findUnique.mockResolvedValue({ role: "EMPLOYEE" });

    const result = await markExit(
      {},
      form({ employeeId: "e1", dateOfExit: "2026-10-01" }),
    );

    expect(result).toEqual({ ok: true });
    expect(db.employee.update.mock.calls[0][0].data.dateOfExit).toEqual(
      new Date("2026-10-01"),
    );
    expect(db.idCard.update.mock.calls[0][0].data).toMatchObject({
      status: "RETURN_PENDING",
      statusChanges: {
        create: {
          fromStatus: "ISSUED",
          toStatus: "RETURN_PENDING",
          changedById: "hr",
        },
      },
    });
    expect(db.probationRecord.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { status: "EXITED" },
    });
    expect(db.user.update.mock.calls[0][0]).toMatchObject({
      where: { id: "u1" },
    });
    expect(db.user.update.mock.calls[0][0].data.disabledAt).toBeInstanceOf(
      Date,
    );
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("leaves a confirmed probation and a returned card alone", async () => {
    db.employee.findUnique.mockResolvedValue({
      ...baseEmployee,
      userId: null,
      idCard: { id: "c1", status: "RETURNED" },
      probation: { id: "p1", status: "CONFIRMED", extendedTo: null },
    });
    await markExit({}, form({ employeeId: "e1", dateOfExit: "2026-10-01" }));
    expect(db.idCard.update).not.toHaveBeenCalled();
    expect(db.probationRecord.update).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses to exit the only HR admin", async () => {
    db.employee.findUnique.mockResolvedValue(baseEmployee);
    db.user.findUnique.mockResolvedValue({ role: "HR_ADMIN" });
    db.user.count.mockResolvedValue(0);
    const result = await markExit(
      {},
      form({ employeeId: "e1", dateOfExit: "2026-10-01" }),
    );
    expect(result.error).toMatch(/only HR admin/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an employee who already exited", async () => {
    db.employee.findUnique.mockResolvedValue({
      ...baseEmployee,
      dateOfExit: new Date(),
    });
    const result = await markExit(
      {},
      form({ employeeId: "e1", dateOfExit: "2026-10-01" }),
    );
    expect(result.error).toMatch(/already marked/);
  });

  it("needs an employee and a date", async () => {
    const result = await markExit({}, form({ employeeId: "e1" }));
    expect(result.fieldErrors?.dateOfExit?.[0]).toMatch(/required/);
    expect(result.fieldErrors?.employeeId).toBeUndefined();
    const blank = await markExit({}, form({ employeeId: "", dateOfExit: "" }));
    expect(blank.fieldErrors?.employeeId?.[0]).toMatch(/Pick the employee/);
    expect(blank.fieldErrors?.dateOfExit?.[0]).toMatch(/required/);
  });
});

describe("undoExit", () => {
  it("re-enables the login, reopens probation, restores the card", async () => {
    db.employee.update.mockResolvedValue({
      ...baseEmployee,
      idCard: { id: "c1", status: "RETURN_PENDING" },
      probation: { id: "p1", status: "EXITED", extendedTo: null },
    });
    db.idCardStatusChange.findFirst.mockResolvedValue({
      fromStatus: "RE_ISSUE",
    });

    await undoExit(form({ employeeId: "e1" }));

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { disabledAt: null },
    });
    expect(db.probationRecord.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { status: "PENDING" },
    });
    expect(db.idCard.update.mock.calls[0][0].data).toMatchObject({
      status: "RE_ISSUE",
      statusChanges: {
        create: { fromStatus: "RETURN_PENDING", toStatus: "RE_ISSUE" },
      },
    });
  });

  it("reopens an extended probation as EXTENDED", async () => {
    db.employee.update.mockResolvedValue({
      ...baseEmployee,
      userId: null,
      idCard: null,
      probation: { id: "p1", status: "EXITED", extendedTo: new Date() },
    });
    await undoExit(form({ employeeId: "e1" }));
    expect(db.probationRecord.update.mock.calls[0][0].data).toEqual({
      status: "EXTENDED",
    });
  });

  it("falls back to ISSUED when the exit predates the status log", async () => {
    db.employee.update.mockResolvedValue({
      ...baseEmployee,
      idCard: { id: "c1", status: "RETURN_PENDING" },
      probation: null,
    });
    db.idCardStatusChange.findFirst.mockResolvedValue(null);
    await undoExit(form({ employeeId: "e1" }));
    expect(db.idCard.update.mock.calls[0][0].data.status).toBe("ISSUED");
  });

  it("leaves a card that was already returned", async () => {
    db.employee.update.mockResolvedValue({
      ...baseEmployee,
      idCard: { id: "c1", status: "RETURNED" },
      probation: null,
    });
    await undoExit(form({ employeeId: "e1" }));
    expect(db.idCard.update).not.toHaveBeenCalled();
  });
});
