import { beforeEach, describe, expect, it, vi } from "vitest";

// Assign form actions: problems land under the input they're about.

const db = vi.hoisted(() => ({
  assignmentQuery: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  appSetting: { findUnique: vi.fn(async () => null), upsert: vi.fn() },
  job: { groupBy: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  designerBelief: { count: vi.fn(async () => 0) },
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
const syncChoiceTodo = vi.hoisted(() => vi.fn(async () => ({ status: "skipped" })));
vi.mock("@/lib/assign/todo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assign/todo")>()),
  syncChoiceTodo,
}));

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

  it("refuses the floor manager until his beliefs are written", async () => {
    db.appSetting.findUnique.mockResolvedValueOnce({ value: { userId: "m1" } } as never);
    db.designerBelief.count.mockResolvedValueOnce(0);
    const state = await actions.askSuggestion(
      {},
      form({ description: "Diwali carousel for the client" }),
    );
    expect(state.error).toMatch(/Beliefs tab/);
    expect(classifyDescription).not.toHaveBeenCalled();
    expect(db.assignmentQuery.create).not.toHaveBeenCalled();
  });

  it("answers the floor manager once his beliefs are written", async () => {
    db.appSetting.findUnique.mockResolvedValueOnce({ value: { userId: "m1" } } as never);
    db.designerBelief.count.mockResolvedValueOnce(4);
    db.assignmentQuery.create.mockResolvedValue({ id: "q1" });
    const state = await actions.askSuggestion(
      {},
      form({ description: "Diwali carousel for the client", kind: "social-post" }),
    );
    expect(state.error).toBeUndefined();
    expect(state.queryId).toBe("q1");
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
    db.assignmentQuery.findUnique.mockResolvedValue({ id: "q1", description: "Brief", basecampTodoId: null });
    const state = await actions.recordChoice({}, form({ queryId: "q1", personId: "p9" }));
    expect(state).toEqual({ ok: true });
    expect(syncChoiceTodo).toHaveBeenCalledWith({
      id: "q1",
      description: "Brief",
      basecampTodoId: null,
      chosenPersonId: "p9",
    });
  });

  it("links the [test] to-do, or says why there isn't one", async () => {
    db.assignmentQuery.updateMany.mockResolvedValue({ count: 1 });
    db.assignmentQuery.findUnique.mockResolvedValue({ id: "q1", description: "Brief", basecampTodoId: null });
    syncChoiceTodo.mockResolvedValueOnce({ status: "written", url: "https://bc/todos/1" } as never);
    expect(await actions.recordChoice({}, form({ queryId: "q1", personId: "p9" }))).toEqual({
      ok: true,
      todoUrl: "https://bc/todos/1",
    });
    syncChoiceTodo.mockResolvedValueOnce({ status: "failed", error: "403" } as never);
    expect(await actions.recordChoice({}, form({ queryId: "q1", personId: "p9" }))).toEqual({
      ok: true,
      todoError: "403",
    });
  });

  it("writes nothing to Basecamp for someone else's question", async () => {
    db.assignmentQuery.updateMany.mockResolvedValue({ count: 0 });
    const state = await actions.recordChoice({}, form({ queryId: "q1", personId: "p9" }));
    expect(state.error).toMatch(/isn't yours/);
    expect(syncChoiceTodo).not.toHaveBeenCalled();
  });
});

describe("drawSample", () => {
  it("marks 30 train jobs for both coordinators the first time", async () => {
    const pool = Array.from({ length: 200 }, (_, i) => ({ id: `j${i}` }));
    db.job.groupBy.mockResolvedValue([]);
    db.job.findMany
      .mockResolvedValueOnce(pool) // candidates
      .mockResolvedValueOnce(pool.slice(0, 60)); // the train set after drawing
    const state = await actions.drawSample({}, form({ size: "150" }));
    expect(state.ok).toMatch(/50 holdout, 40 dev, 60 train drawn\. 30 of the train jobs/);
    const saved = db.appSetting.upsert.mock.calls[0][0].create.value.jobIds;
    expect(saved).toHaveLength(30);
  });

  it("keeps the shared set when more jobs are drawn later", async () => {
    db.appSetting.findUnique.mockResolvedValueOnce({ value: { jobIds: ["j1"] } } as never);
    db.job.groupBy.mockResolvedValue([
      { evalSet: "holdout", _count: { _all: 50 } },
      { evalSet: "dev", _count: { _all: 40 } },
    ]);
    db.job.findMany.mockResolvedValueOnce([{ id: "j500" }, { id: "j501" }]);
    const state = await actions.drawSample({}, form({ size: "10" }));
    expect(state.ok).toBe("0 holdout, 0 dev, 2 train drawn.");
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });
});

describe("setTodoList", () => {
  it("keeps a valid to-do list link", async () => {
    const state = await actions.setTodoList(
      {},
      form({ url: "https://3.basecamp.com/1/buckets/2/todolists/3/" }),
    );
    expect(state.ok).toMatch(/\[test\] to-do/);
    expect(db.appSetting.upsert.mock.calls[0][0].create.value).toEqual({
      url: "https://3.basecamp.com/1/buckets/2/todolists/3",
    });
  });

  it("refuses anything that isn't a to-do list link", async () => {
    const state = await actions.setTodoList({}, form({ url: "https://3.basecamp.com/1/projects/2" }));
    expect(state.fieldErrors?.url?.[0]).toMatch(/to-do list link/);
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("turns it off when emptied", async () => {
    const state = await actions.setTodoList({}, form({ url: "" }));
    expect(state.ok).toBe("Turned off.");
    expect(db.appSetting.upsert.mock.calls[0][0].update.value).toEqual({ url: null });
  });
});
