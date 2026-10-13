import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sync = vi.hoisted(() => ({ syncAllChats: vi.fn(async () => ({ chats: 41, added: 3, failed: 0 })) }));
vi.mock("@/lib/chat/sync", () => sync);

const { GET } = await import("./route");
const authorized = () => new NextRequest("https://h/api/cron/chat-sync", { headers: { authorization: "Bearer s" } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s";
});

describe("chat-sync cron", () => {
  it("needs the cron secret", async () => {
    expect((await GET(new NextRequest("https://h/api/cron/chat-sync"))).status).toBe(401);
    expect(sync.syncAllChats).not.toHaveBeenCalled();
  });

  it("syncs every chat", async () => {
    expect(await (await GET(authorized())).json()).toEqual({ chats: 41, added: 3, failed: 0 });
  });

  it("503s when Basecamp isn't connected", async () => {
    sync.syncAllChats.mockRejectedValueOnce(new Error("No HR admin has connected Basecamp"));
    expect((await GET(authorized())).status).toBe(503);
  });
});
