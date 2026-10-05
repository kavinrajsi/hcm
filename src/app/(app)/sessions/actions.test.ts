import { beforeEach, describe, expect, it, vi } from "vitest";

// createSession / logAttendance: field problems land under the input.

const db = vi.hoisted(() => ({
  trainingSession: { create: vi.fn() },
  sessionAttendance: { create: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
  requireUser: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createSession, logAttendance } = await import("./actions");

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => vi.clearAllMocks());

describe("createSession", () => {
  it("creates a valid session", async () => {
    const state = await createSession(
      {},
      form({
        name: "Figma 101",
        date: "2026-10-01T10:00",
        trainer: "Ravi",
        mode: "VIRTUAL",
      }),
    );
    expect(state).toEqual({ ok: true });
    // 10:00 in India, not 10:00 UTC (which would show 5½ hours late).
    expect(db.trainingSession.create.mock.calls[0][0].data.date.toISOString()).toBe(
      "2026-10-01T04:30:00.000Z",
    );
  });

  it("puts each problem under its field", async () => {
    const state = await createSession(
      {},
      form({ name: "", date: "2026-10-01T10:00", trainer: "", mode: "X" }),
    );
    expect(state.fieldErrors?.name?.[0]).toMatch(/Session name is required/);
    expect(state.fieldErrors?.trainer?.[0]).toMatch(/Trainer is required/);
    expect(state.fieldErrors?.mode?.[0]).toMatch(/in-person or virtual/);
    expect(state.fieldErrors?.date).toBeUndefined();
    expect(db.trainingSession.create).not.toHaveBeenCalled();
  });
});

describe("logAttendance", () => {
  it("flags the missing employee and session name", async () => {
    const state = await logAttendance(
      {},
      form({ employeeId: "", sessionName: "", date: "2026-10-01" }),
    );
    expect(state.fieldErrors?.employeeId?.[0]).toMatch(/Employee is required/);
    expect(state.fieldErrors?.sessionName?.[0]).toMatch(/Session name/);
    expect(db.sessionAttendance.create).not.toHaveBeenCalled();
  });
});
