import { beforeEach, describe, expect, it, vi } from "vitest";

// extendProbation: the extension date's problem shows under that input.

const hcmOps = vi.hoisted(() => ({
  confirmProbationRecord: vi.fn(),
  extendProbationRecord: vi.fn(),
  ProbationStateError: class ProbationStateError extends Error {},
}));

vi.mock("@/lib/hcm-ops", () => hcmOps);
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { confirmProbation, extendProbation } = await import("./actions");

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => vi.clearAllMocks());

describe("extendProbation", () => {
  it("extends to the chosen date", async () => {
    const state = await extendProbation(
      {},
      form({ id: "p1", extendedTo: "2026-12-31", notes: "More time" }),
    );
    expect(state).toEqual({ ok: true });
    expect(hcmOps.extendProbationRecord).toHaveBeenCalledWith(
      "p1",
      new Date("2026-12-31"),
      "More time",
    );
  });

  it("needs a date, shown under the date input", async () => {
    const state = await extendProbation({}, form({ id: "p1", extendedTo: "" }));
    expect(state.fieldErrors?.extendedTo?.[0]).toMatch(/date to extend to/);
    expect(hcmOps.extendProbationRecord).not.toHaveBeenCalled();
  });

  it("shows why an extension isn't allowed under the date input", async () => {
    hcmOps.extendProbationRecord.mockRejectedValueOnce(
      new hcmOps.ProbationStateError("Extend to a date after the current due date."),
    );
    const state = await extendProbation({}, form({ id: "p1", extendedTo: "2026-01-01" }));
    expect(state.fieldErrors?.extendedTo).toEqual(["Extend to a date after the current due date."]);
  });
});

describe("confirmProbation", () => {
  it("treats an already-decided probation as nothing to do", async () => {
    hcmOps.confirmProbationRecord.mockRejectedValueOnce(new hcmOps.ProbationStateError("already confirmed"));
    await expect(confirmProbation(form({ id: "p1" }))).resolves.toBeUndefined();
  });
});
