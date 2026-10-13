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
  return { sendChatUpload: vi.fn(), BasecampNotConnectedError, MAX_UPLOAD_BYTES: 4 * 1024 * 1024 };
});
vi.mock("@/lib/chat/sync", () => sync);
vi.mock("@/lib/chat/messages", () => ({
  toMessages: vi.fn(async (rows: { basecampId: string }[]) => rows.map((row) => ({ id: row.basecampId }))),
}));

const { POST } = await import("./route");
const ctx = { params: Promise.resolve({ chatId: "9" }) };
const upload = (file?: File) => {
  const form = new FormData();
  if (file) form.set("file", file);
  return POST(new Request("https://hcm.test/api/chat/9/uploads", { method: "POST", body: form }), ctx);
};

beforeEach(() => {
  vi.clearAllMocks();
  rbac.currentUser.mockResolvedValue({ id: "manager-1", role: "MANAGER" });
  db.basecampChat.count.mockResolvedValue(1);
});

describe("POST /api/chat/[chatId]/uploads", () => {
  it("is for HR and managers only", async () => {
    rbac.currentUser.mockResolvedValueOnce({ id: "e1", role: "EMPLOYEE" });
    expect((await upload(new File(["x"], "a.txt"))).status).toBe(403);
    expect(sync.sendChatUpload).not.toHaveBeenCalled();
  });

  it("needs a file", async () => {
    expect((await upload()).status).toBe(400);
  });

  it("refuses files over 4 MB", async () => {
    const response = await upload(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.mov"));
    expect(response.status).toBe(413);
    expect(sync.sendChatUpload).not.toHaveBeenCalled();
  });

  it("sends the file as the signed-in person", async () => {
    sync.sendChatUpload.mockResolvedValue({ basecampId: "11" });
    const response = await upload(new File(["hello"], "note.txt", { type: "text/plain" }));
    expect(await response.json()).toEqual({ message: { id: "11" } });
    expect(sync.sendChatUpload).toHaveBeenCalledWith(
      "manager-1",
      "9",
      expect.objectContaining({ name: "note.txt", type: "text/plain" }),
    );
  });

  it("tells the page when the sender hasn't connected Basecamp", async () => {
    sync.sendChatUpload.mockRejectedValue(new sync.BasecampNotConnectedError());
    const response = await upload(new File(["x"], "a.txt"));
    expect(response.status).toBe(409);
    expect((await response.json()).notConnected).toBe(true);
  });
});
