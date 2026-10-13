import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  basecampChatRead: { findFirst: vi.fn(), createMany: vi.fn(), upsert: vi.fn() },
  basecampChat: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

const { markChatRead, unreadCounts } = await import("./reads");

beforeEach(() => vi.clearAllMocks());

describe("unreadCounts", () => {
  it("treats everything as read on someone's first visit", async () => {
    db.basecampChatRead.findFirst.mockResolvedValue(null);
    db.basecampChat.findMany.mockResolvedValue([{ basecampId: "1" }, { basecampId: "2" }]);
    expect((await unreadCounts("u1", "77")).size).toBe(0);
    expect(db.basecampChatRead.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: "u1", chatBasecampId: "1" }),
        expect.objectContaining({ userId: "u1", chatBasecampId: "2" }),
      ],
      skipDuplicates: true,
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("counts lines since the last read, leaving out your own", async () => {
    db.basecampChatRead.findFirst.mockResolvedValue({ userId: "u1" });
    db.$queryRaw.mockResolvedValue([{ chatBasecampId: "1", unread: 3 }]);
    const counts = await unreadCounts("u1", "77");
    expect(counts.get("1")).toBe(3);
    const [strings, ...values] = db.$queryRaw.mock.calls[0];
    const sql = (strings as string[]).join("?");
    expect(sql).toContain('"lastReadAt"');
    expect(JSON.stringify(values)).toContain("77");
    expect(JSON.stringify(values)).toContain("creatorPersonId");
  });
});

describe("markChatRead", () => {
  it("records the time the chat was seen", async () => {
    const at = new Date("2026-10-13T08:00:00Z");
    await markChatRead("u1", "9", at);
    expect(db.basecampChatRead.upsert).toHaveBeenCalledWith({
      where: { userId_chatBasecampId: { userId: "u1", chatBasecampId: "9" } },
      create: { userId: "u1", chatBasecampId: "9", lastReadAt: at },
      update: { lastReadAt: at },
    });
  });
});
