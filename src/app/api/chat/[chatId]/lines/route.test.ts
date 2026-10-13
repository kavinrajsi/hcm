import { beforeEach, describe, expect, it, vi } from "vitest";

const rbac = vi.hoisted(() => ({ currentUser: vi.fn() }));
vi.mock("@/lib/rbac", () => rbac);
const db = vi.hoisted(() => ({ basecampChat: { count: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
const sync = vi.hoisted(() => {
  class BasecampNotConnectedError extends Error {
    constructor() {
      super("Connect your Basecamp account to reply.");
    }
  }
  return { refreshChatIfStale: vi.fn(), sendChatLine: vi.fn(), BasecampNotConnectedError };
});
vi.mock("@/lib/chat/sync", () => sync);
const messages = vi.hoisted(() => ({
  messagesAfter: vi.fn(async () => [{ id: "3" }]),
  messagesBefore: vi.fn(async () => ({ messages: [{ id: "1" }], hasEarlier: false })),
  toMessages: vi.fn(async (rows: { basecampId: string }[]) => rows.map((row) => ({ id: row.basecampId }))),
}));
vi.mock("@/lib/chat/messages", () => messages);
const reads = vi.hoisted(() => ({ markChatRead: vi.fn() }));
vi.mock("@/lib/chat/reads", () => reads);

const { GET, POST } = await import("./route");
const ctx = { params: Promise.resolve({ chatId: "9" }) };
const get = (query = "") => GET(new Request(`https://hcm.test/api/chat/9/lines${query}`), ctx);
const post = (body: unknown) =>
  POST(new Request("https://hcm.test/api/chat/9/lines", { method: "POST", body: JSON.stringify(body) }), ctx);

beforeEach(() => {
  vi.clearAllMocks();
  rbac.currentUser.mockResolvedValue({ id: "manager-1", role: "MANAGER" });
  db.basecampChat.count.mockResolvedValue(1);
});

describe("/api/chat/[chatId]/lines", () => {
  it("is for HR and managers only", async () => {
    rbac.currentUser.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
    rbac.currentUser.mockResolvedValueOnce({ id: "e1", role: "EMPLOYEE" });
    expect((await get()).status).toBe(403);
    rbac.currentUser.mockResolvedValueOnce({ id: "e1", role: "EMPLOYEE" });
    expect((await post({ text: "hi" })).status).toBe(403);
    expect(sync.sendChatLine).not.toHaveBeenCalled();
  });

  it("404s an unknown chat", async () => {
    db.basecampChat.count.mockResolvedValue(0);
    expect((await get()).status).toBe(404);
  });

  it("polls: refreshes from Basecamp, then returns newer messages", async () => {
    const response = await get("?after=2026-10-13T05:00:00.000Z");
    expect(sync.refreshChatIfStale).toHaveBeenCalledWith("9");
    expect(messages.messagesAfter).toHaveBeenCalledWith("9", "2026-10-13T05:00:00.000Z");
    expect(await response.json()).toEqual({ messages: [{ id: "3" }] });
    expect(reads.markChatRead).toHaveBeenCalledWith("manager-1", "9");
  });

  it("still answers when the Basecamp check fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sync.refreshChatIfStale.mockRejectedValueOnce(new Error("Basecamp 500"));
    expect((await get("?after=2026-10-13T05:00:00.000Z")).status).toBe(200);
  });

  it("loads earlier messages without calling Basecamp", async () => {
    expect(await (await get("?before=2026-10-13T05:00:00.000Z")).json()).toEqual({
      messages: [{ id: "1" }],
      hasEarlier: false,
    });
    expect(sync.refreshChatIfStale).not.toHaveBeenCalled();
    expect(reads.markChatRead).not.toHaveBeenCalled();
  });

  it("sends as the signed-in person", async () => {
    sync.sendChatLine.mockResolvedValue({ basecampId: "10" });
    expect(await (await post({ text: " Hello " })).json()).toEqual({ message: { id: "10" } });
    expect(sync.sendChatLine).toHaveBeenCalledWith("manager-1", "9", "Hello");
  });

  it("rejects an empty message", async () => {
    const response = await post({ text: "   " });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Type a message" });
  });

  it("tells the page when the sender hasn't connected Basecamp", async () => {
    sync.sendChatLine.mockRejectedValue(new sync.BasecampNotConnectedError());
    const response = await post({ text: "Hi" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Connect your Basecamp account to reply.", notConnected: true });
  });
});
