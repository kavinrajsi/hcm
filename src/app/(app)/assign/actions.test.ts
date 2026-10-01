import { beforeEach, describe, expect, it, vi } from "vitest";

// Assign form actions: problems land under the input they're about.

const db = vi.hoisted(() => ({
  assignmentQuery: { create: vi.fn(), updateMany: vi.fn() },
}));
const classifyDescription = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "m1", role: "MANAGER" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/assign/classify", () => ({
  classifyDescription,
  classifyPending: vi.fn(),
}));
vi.mock("@/lib/assign/data", () => ({
  listDesigners: vi.fn(async () => []),
  loadHistories: vi.fn(async () => []),
}));
vi.mock("@/lib/assign/suggest", () => ({ suggest: vi.fn(() => ({})) }));

const actions = await import("./actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("askSuggestion", () => {
  it("puts a too-short brief under the description field", async () => {
    const state = await actions.askSuggestion({}, form({ description: "logo" }));
    expect(state.fieldErrors?.description?.[0]).toMatch(/sentence or two/);
    expect(state.error).toBe("Fix the highlighted fields.");
    expect(classifyDescription).not.toHaveBeenCalled();
    expect(db.assignmentQuery.create).not.toHaveBeenCalled();
  });
});

describe("recordChoice", () => {
  it("asks for a designer on the designer field", async () => {
    const state = await actions.recordChoice({}, form({ queryId: "q1", personId: "" }));
    expect(state.fieldErrors?.personId?.[0]).toBe("Pick a designer first.");
    expect(db.assignmentQuery.updateMany).not.toHaveBeenCalled();
  });

  it("records the choice", async () => {
    db.assignmentQuery.updateMany.mockResolvedValue({ count: 1 });
    const state = await actions.recordChoice({}, form({ queryId: "q1", personId: "p9" }));
    expect(state).toEqual({ ok: true });
  });
});
