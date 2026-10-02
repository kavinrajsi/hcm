import { beforeEach, describe, expect, it, vi } from "vitest";

// The "[test]" to-do written to Basecamp when a pick is recorded. fetch is
// mocked: nothing here reaches Basecamp.

const db = vi.hoisted(() => ({
  appSetting: { findUnique: vi.fn() },
  assignmentQuery: { update: vi.fn() },
  basecampToken: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/leave-sync", () => ({ leaveSyncUserId: vi.fn(async () => "hr1") }));
vi.mock("@/lib/crypto", () => ({ decryptField: (value: string) => value, encryptField: (value: string) => value }));

const { parseTodolistUrl, todoContent, todoDescription, syncChoiceTodo } = await import("./todo");
const { testTodoTitle } = await import("@/lib/basecamp");

const LIST = "https://3.basecamp.com/3251537/buckets/1710547/todolists/9001";
const fetchMock = vi.fn();

const okTodo = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({
    id: 555,
    app_url: "https://3.basecamp.com/3251537/buckets/1710547/todos/555",
    content: "[test] Diwali carousel",
    assignees: [{ id: 42, name: "Rupa" }],
    ...overrides,
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  db.appSetting.findUnique.mockResolvedValue({ value: { url: LIST } });
  db.basecampToken.findUnique.mockResolvedValue({
    accessTokenEnc: "token",
    accountId: "3251537",
    expiresAt: new Date(Date.now() + 60_000),
  });
});

describe("testTodoTitle", () => {
  it("prefixes [test] once", () => {
    expect(testTodoTitle("Diwali carousel")).toBe("[test] Diwali carousel");
    expect(testTodoTitle("[test] Diwali carousel")).toBe("[test] Diwali carousel");
    expect(testTodoTitle("[TEST] Diwali")).toBe("[TEST] Diwali");
  });
});

describe("parseTodolistUrl", () => {
  it("reads a to-do list link and nothing else", () => {
    expect(parseTodolistUrl(`${LIST}?foo=1`)).toEqual({
      url: LIST,
      accountId: "3251537",
      bucketId: "1710547",
      todolistId: "9001",
    });
    expect(parseTodolistUrl("https://3.basecamp.com/1/buckets/2/todos/3")).toBeNull();
    expect(parseTodolistUrl("https://evil.example/1/buckets/2/todolists/3")).toBeNull();
  });
});

describe("todo text", () => {
  it("titles with the brief's first line, capped at 120 characters", () => {
    expect(todoContent("Diwali carousel\nSizes: 1080x1080")).toBe("Diwali carousel");
    expect(todoContent("x".repeat(200))).toHaveLength(118);
  });

  it("escapes the brief into the description", () => {
    expect(todoDescription("<b>logo</b> & more")).toContain("&lt;b&gt;logo&lt;/b&gt; &amp; more");
  });
});

describe("syncChoiceTodo", () => {
  const query = { id: "q1", description: "Diwali carousel\nfor the client", chosenPersonId: "42", basecampTodoId: null };

  it("does nothing until HR sets a list", async () => {
    db.appSetting.findUnique.mockResolvedValue(null);
    expect(await syncChoiceTodo(query)).toEqual({ status: "skipped" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a [test] to-do assigned to the pick, without notifying", async () => {
    fetchMock.mockResolvedValue(okTodo());
    const outcome = await syncChoiceTodo(query);
    expect(outcome).toEqual({ status: "written", url: "https://3.basecamp.com/3251537/buckets/1710547/todos/555" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://3.basecampapi.com/3251537/buckets/1710547/todolists/9001/todos.json");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ content: "[test] Diwali carousel", assignee_ids: [42], notify: false });
    expect(db.assignmentQuery.update).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: { basecampTodoId: "555", basecampTodoUrl: "https://3.basecamp.com/3251537/buckets/1710547/todos/555" },
    });
  });

  it("reassigns the existing to-do on a new pick, resending every field", async () => {
    fetchMock.mockResolvedValue(okTodo({ assignees: [{ id: 7, name: "Maha" }] }));
    await syncChoiceTodo({ ...query, chosenPersonId: "7", basecampTodoId: "555" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://3.basecampapi.com/3251537/buckets/1710547/todos/555.json");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body);
    expect(body.content).toBe("[test] Diwali carousel");
    expect(body.description).toContain("Diwali carousel");
    expect(body.assignee_ids).toEqual([7]);
  });

  it("reports a Basecamp failure instead of throwing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => "Forbidden" });
    const outcome = await syncChoiceTodo(query);
    expect(outcome).toEqual({ status: "failed", error: "Basecamp to-do create failed: 403 Forbidden" });
    expect(db.assignmentQuery.update).not.toHaveBeenCalled();
  });

  it("flags a to-do Basecamp saved without the assignee", async () => {
    fetchMock.mockResolvedValue(okTodo({ assignees: [] }));
    const outcome = await syncChoiceTodo(query);
    expect(outcome.status).toBe("failed");
    expect(db.assignmentQuery.update).toHaveBeenCalled();
  });

  it("needs a Basecamp connection", async () => {
    db.basecampToken.findUnique.mockResolvedValue(null);
    expect(await syncChoiceTodo(query)).toEqual({ status: "failed", error: "Basecamp isn't connected by an HR admin." });
  });
});
