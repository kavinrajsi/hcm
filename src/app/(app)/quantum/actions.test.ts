import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  quantumTodo: { findUnique: vi.fn() },
  quantumHours: { count: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: "u2", role: "EMPLOYEE", email: "ravi@madarth.com" })),
}));
vi.mock("@/lib/my-employee", () => ({ myEmployeeId: vi.fn(async () => "emp-1") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { logQuantumHours } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  db.employee.findUnique.mockResolvedValue({ id: "emp-1", basecampPersonId: "5" });
  db.quantumTodo.findUnique.mockResolvedValue({ basecampId: "42", assigneeIds: ["5", "6"] });
  db.quantumHours.count.mockResolvedValue(0);
});

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe("logQuantumHours", () => {
  it("saves your hours on your own to-do", async () => {
    expect(await logQuantumHours({}, form({ todoId: "42", hours: "1.5" }))).toEqual({ ok: true });
    expect(db.quantumHours.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { todoBasecampId_employeeId: { todoBasecampId: "42", employeeId: "emp-1" } },
        create: expect.objectContaining({ minutes: 90, source: "hcm", employeeId: "emp-1" }),
      }),
    );
  });

  it("clears your hours when you save 0 or blank", async () => {
    await logQuantumHours({}, form({ todoId: "42", hours: "" }));
    expect(db.quantumHours.deleteMany).toHaveBeenCalledWith({ where: { todoBasecampId: "42", employeeId: "emp-1" } });
    expect(db.quantumHours.upsert).not.toHaveBeenCalled();
  });

  it("refuses a to-do that isn't assigned to you", async () => {
    db.quantumTodo.findUnique.mockResolvedValue({ basecampId: "42", assigneeIds: ["6"] });
    expect(await logQuantumHours({}, form({ todoId: "42", hours: "1" }))).toEqual({
      error: "You can only log hours on to-dos assigned to you.",
    });
    expect(db.quantumHours.upsert).not.toHaveBeenCalled();
  });

  it("refuses when the hours already come from Basecamp", async () => {
    db.quantumHours.count.mockResolvedValue(1);
    const state = await logQuantumHours({}, form({ todoId: "42", hours: "1" }));
    expect(state.fieldErrors?.hours).toEqual(["This to-do's hours come from Basecamp's timesheet."]);
  });

  it("needs a linked Basecamp account", async () => {
    db.employee.findUnique.mockResolvedValue({ id: "emp-1", basecampPersonId: null });
    expect((await logQuantumHours({}, form({ todoId: "42", hours: "1" }))).error).toMatch("isn't linked");
  });

  it("rejects negative hours under the field", async () => {
    const state = await logQuantumHours({}, form({ todoId: "42", hours: "-1" }));
    expect(state.fieldErrors?.hours).toEqual(["Hours can't be negative"]);
  });
});
