import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  basecampChat: { upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  basecampChatLine: { findMany: vi.fn(), createMany: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
const basecamp = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  eachPage: vi.fn(),
}));
vi.mock("@/lib/basecamp", () => basecamp);
vi.mock("@/lib/leave-sync", () => ({ leaveSyncUserId: vi.fn(async () => "hr-1") }));

const { syncChatLines, refreshChatIfStale, sendChatLine, BasecampNotConnectedError } = await import("./sync");

const LINES_URL = "https://3.basecampapi.com/1/chats/9/lines.json";
const line = (id: number, at: string) => ({ id, created_at: at, content: `<div>Message ${id}</div>`, creator: { id: 77, name: "Ravi" } });
const hrToken = { accessToken: "hr-token", accountId: "1" };

beforeEach(() => {
  vi.clearAllMocks();
  basecamp.getAccessToken.mockImplementation(async (userId: string) =>
    userId === "hr-1" ? hrToken : userId === "manager-1" ? { accessToken: "manager-token", accountId: "1" } : null,
  );
  db.basecampChatLine.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
});

describe("syncChatLines", () => {
  it("adds new lines and stops at the first page holding a known one", async () => {
    db.basecampChatLine.findMany.mockResolvedValueOnce([{ basecampId: "2" }]);
    const stops: unknown[] = [];
    basecamp.eachPage.mockImplementation(async (_token, _url, _agent, onPage) => {
      stops.push(await onPage([line(3, "2026-10-13T05:00:00Z"), line(2, "2026-10-13T04:00:00Z")]));
    });

    const added = await syncChatLines(hrToken, { basecampId: "9", linesUrl: LINES_URL });

    expect(added).toBe(1);
    expect(stops).toEqual([true]);
    expect(db.basecampChatLine.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ basecampId: "3", chatBasecampId: "9", creatorName: "Ravi" }),
    ]);
    expect(db.basecampChatLine.createMany.mock.calls[0][0].data[0]).not.toHaveProperty("preview");
    expect(db.basecampChat.update).toHaveBeenCalledWith({
      where: { basecampId: "9" },
      data: expect.objectContaining({
        lastLineAt: new Date("2026-10-13T05:00:00Z"),
        lastLinePreview: "Ravi: Message 3",
      }),
    });
  });

  it("keeps paging on the first load (nothing known yet)", async () => {
    db.basecampChatLine.findMany.mockResolvedValue([]);
    const stops: unknown[] = [];
    basecamp.eachPage.mockImplementation(async (_token, _url, _agent, onPage) => {
      stops.push(await onPage([line(2, "2026-10-13T04:00:00Z")]));
      stops.push(await onPage([line(1, "2026-10-12T04:00:00Z")]));
    });
    expect(await syncChatLines(hrToken, { basecampId: "9", linesUrl: LINES_URL })).toBe(2);
    expect(stops).toEqual([false, false]);
  });

  it("refuses a lines URL that isn't Basecamp's API", async () => {
    await expect(syncChatLines(hrToken, { basecampId: "9", linesUrl: "https://evil.example/x" })).rejects.toThrow();
    expect(basecamp.eachPage).not.toHaveBeenCalled();
  });
});

describe("refreshChatIfStale", () => {
  it("checks Basecamp only when it wins the 5-second claim", async () => {
    db.basecampChat.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    db.basecampChat.findUnique.mockResolvedValue({ basecampId: "9", linesUrl: LINES_URL });
    db.basecampChatLine.findMany.mockResolvedValue([]);
    basecamp.eachPage.mockImplementation(async () => {});
    const now = new Date("2026-10-13T05:00:00Z");

    expect(await refreshChatIfStale("9", now)).toBe(true);
    expect(await refreshChatIfStale("9", now)).toBe(false);

    expect(basecamp.eachPage).toHaveBeenCalledTimes(1);
    expect(db.basecampChat.updateMany.mock.calls[0][0].where).toEqual({
      basecampId: "9",
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date("2026-10-13T04:59:55Z") } }],
    });
  });
});

describe("sendChatLine", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    db.basecampChat.findUnique.mockResolvedValue({ basecampId: "9", linesUrl: LINES_URL });
  });

  it("posts with the sender's own token, never HR's, and stores the line", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(line(10, "2026-10-13T06:00:00Z")), { status: 201 }),
    );
    const row = await sendChatLine("manager-1", "9", "Hello <team>");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(LINES_URL);
    expect(init.headers.Authorization).toBe("Bearer manager-token");
    expect(JSON.parse(init.body)).toEqual({ content: "<div>Hello &lt;team&gt;</div>", content_type: "text/html" });
    expect(row.basecampId).toBe("10");
    expect(db.basecampChatLine.upsert).toHaveBeenCalled();
  });

  it("asks people without a Basecamp connection to connect", async () => {
    await expect(sendChatLine("employee-1", "9", "Hi")).rejects.toBeInstanceOf(BasecampNotConnectedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("won't post into another Basecamp account", async () => {
    basecamp.getAccessToken.mockResolvedValueOnce({ accessToken: "t", accountId: "2" });
    await expect(sendChatLine("manager-1", "9", "Hi")).rejects.toThrow("different Basecamp account");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports Basecamp refusing the message", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 403 }));
    await expect(sendChatLine("manager-1", "9", "Hi")).rejects.toThrow("(403)");
    expect(db.basecampChatLine.upsert).not.toHaveBeenCalled();
  });
});
