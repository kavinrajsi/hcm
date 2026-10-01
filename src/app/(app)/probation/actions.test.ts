import { beforeEach, describe, expect, it, vi } from "vitest";

// extendProbation: the extension date's problem shows under that input.

const hcmOps = vi.hoisted(() => ({
  confirmProbationRecord: vi.fn(),
  extendProbationRecord: vi.fn(),
}));

vi.mock("@/lib/hcm-ops", () => hcmOps);
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { extendProbation } = await import("./actions");

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
});
