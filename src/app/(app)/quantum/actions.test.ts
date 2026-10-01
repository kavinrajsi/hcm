import { beforeEach, describe, expect, it, vi } from "vitest";

// addQuantumEntry / importFromBasecamp: field problems land under the input.

const db = vi.hoisted(() => ({
  quantumEntry: { create: vi.fn(), upsert: vi.fn() },
}));
const basecamp = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  listProjects: vi.fn(),
  listProjectTodos: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
  requireSelfOrRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/basecamp", () => basecamp);

const { addQuantumEntry, importFromBasecamp } = await import("./actions");

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => vi.clearAllMocks());

describe("addQuantumEntry", () => {
  it("adds a valid entry", async () => {
    const state = await addQuantumEntry(
      {},
      form({
        employeeId: "e1",
        date: "2026-10-01",
        brand: "Acme",
        workName: "Banner",
        link: "",
        durationMins: "45",
      }),
    );
    expect(state).toEqual({ ok: true });
    expect(db.quantumEntry.create).toHaveBeenCalled();
  });

  it("puts each problem under its field", async () => {
    const state = await addQuantumEntry(
      {},
      form({
        employeeId: "e1",
        date: "",
        brand: " ",
        workName: "Banner",
        durationMins: "-5",
      }),
    );
    expect(state.fieldErrors?.date?.[0]).toMatch(/Date is required/);
    expect(state.fieldErrors?.brand?.[0]).toMatch(/Brand is required/);
    expect(state.fieldErrors?.durationMins?.[0]).toMatch(/negative/);
    expect(state.fieldErrors?.workName).toBeUndefined();
    expect(db.quantumEntry.create).not.toHaveBeenCalled();
  });
});

describe("importFromBasecamp", () => {
  it("asks for the missing picks under their selects", async () => {
    let state = await importFromBasecamp({}, form({ projectId: "p1" }));
    expect(state.fieldErrors?.employeeId?.[0]).toMatch(/Pick an employee/);
    state = await importFromBasecamp({}, form({ employeeId: "e1" }));
    expect(state.fieldErrors?.projectId?.[0]).toMatch(/Basecamp project/);
  });

  it("keeps a missing Basecamp connection form-wide", async () => {
    basecamp.getAccessToken.mockResolvedValue(null);
    const state = await importFromBasecamp(
      {},
      form({ employeeId: "e1", projectId: "p1" }),
    );
    expect(state.error).toMatch(/not connected/);
    expect(state.fieldErrors).toBeUndefined();
  });
});
