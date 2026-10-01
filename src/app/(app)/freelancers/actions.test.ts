import { beforeEach, describe, expect, it, vi } from "vitest";

// addFreelancer / updateFreelancer: field problems land under the input.

const db = vi.hoisted(() => ({
  freelancer: { create: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { addFreelancer, updateFreelancer } = await import("./actions");

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => vi.clearAllMocks());

describe("addFreelancer", () => {
  it("adds a valid freelancer", async () => {
    const state = await addFreelancer(
      {},
      form({ name: "Meena", skillset: "Illustration" }),
    );
    expect(state).toEqual({ ok: true });
    expect(db.freelancer.create.mock.calls[0][0].data).toMatchObject({
      name: "Meena",
      availability: "UNKNOWN",
    });
  });

  it("puts each problem under its field", async () => {
    const state = await addFreelancer(
      {},
      form({ name: " ", skillset: "", availability: "SOMETIMES" }),
    );
    expect(state.fieldErrors?.name?.[0]).toMatch(/Name is required/);
    expect(state.fieldErrors?.skillset?.[0]).toMatch(/Skillset is required/);
    expect(state.fieldErrors?.availability?.[0]).toMatch(/availability/);
    expect(db.freelancer.create).not.toHaveBeenCalled();
  });
});

describe("updateFreelancer", () => {
  it("flags a blank name", async () => {
    const state = await updateFreelancer(
      "f1",
      {},
      form({ name: "", skillset: "3D" }),
    );
    expect(state.fieldErrors?.name?.[0]).toMatch(/Name is required/);
    expect(db.freelancer.update).not.toHaveBeenCalled();
  });
});
