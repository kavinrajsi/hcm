import { beforeEach, describe, expect, it, vi } from "vitest";

// updateLeaveEntry: each problem lands under the input it's about.

const db = vi.hoisted(() => ({
  leaveEntry: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
  AuthorizationError: class extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/leave-sync", () => ({ syncLeaveFromBasecamp: vi.fn() }));
vi.mock("@/lib/hcm-ops", () => ({ setLeaveDecision: vi.fn() }));

const { updateLeaveEntry } = await import("./actions");

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

const valid = {
  id: "l1",
  type: "FULL_DAY",
  startDate: "2026-10-01",
  endDate: "2026-10-02",
  days: "2",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.leaveEntry.findUnique.mockResolvedValue({ employee: null });
});

describe("updateLeaveEntry", () => {
  it("saves a valid correction", async () => {
    const state = await updateLeaveEntry({}, form(valid));
    expect(state).toEqual({ ok: true });
    expect(db.leaveEntry.update).toHaveBeenCalled();
  });

  it("puts schema problems under their fields", async () => {
    const state = await updateLeaveEntry(
      {},
      form({ ...valid, startDate: "", days: "120" }),
    );
    expect(state.fieldErrors?.startDate?.[0]).toMatch(/Start date/);
    expect(state.fieldErrors?.days?.[0]).toMatch(/99/);
    expect(state.error).toBe("Fix the highlighted fields.");
    expect(db.leaveEntry.update).not.toHaveBeenCalled();
  });

  it("flags an end date before the start under End", async () => {
    const state = await updateLeaveEntry(
      {},
      form({ ...valid, endDate: "2026-09-30" }),
    );
    expect(state.fieldErrors?.endDate?.[0]).toMatch(/before start/);
    expect(db.leaveEntry.update).not.toHaveBeenCalled();
  });

  it("keeps a missing entry as a form-wide error", async () => {
    db.leaveEntry.findUnique.mockResolvedValue(null);
    const state = await updateLeaveEntry({}, form(valid));
    expect(state).toEqual({ error: "Entry not found" });
  });
});
