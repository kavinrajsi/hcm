import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  aiUsage: { groupBy: vi.fn() },
  emailLog: { groupBy: vi.fn() },
  cronRun: { findMany: vi.fn(), findFirst: vi.fn() },
  basecampChat: { aggregate: vi.fn() },
  appSetting: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
const ai = vi.hoisted(() => ({ gateway: { getCredits: vi.fn() } }));
vi.mock("ai", () => ai);
const blob = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@vercel/blob", () => blob);
const basecamp = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock("@/lib/basecamp", () => basecamp);
vi.mock("@/lib/leave-sync", () => ({ leaveSyncUserId: vi.fn(async () => "hr-1") }));
vi.mock("@/lib/quantum/sync", () => ({ QUANTUM_SYNC_SETTING: "quantum.sync" }));

const checks = await import("./checks");
const now = new Date("2026-10-14T06:00:00Z");
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  ai.gateway.getCredits.mockResolvedValue({ balance: "25.50", totalUsed: "10" });
  db.aiUsage.groupBy.mockResolvedValue([]);
  db.cronRun.findMany.mockResolvedValue([]);
  db.cronRun.findFirst.mockResolvedValue(null);
});

describe("database", () => {
  it("is ok when it answers and down when it errors", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    expect((await checks.checkDatabase()).status).toBe("ok");
    db.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    expect(await checks.checkDatabase()).toMatchObject({ status: "down", detail: "connection refused" });
  });
});

describe("Basecamp API", () => {
  it("makes one profile call through the HR connection", async () => {
    basecamp.getAccessToken.mockResolvedValue({ accessToken: "t", accountId: "5" });
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect((await checks.checkBasecamp()).status).toBe("ok");
    expect(fetchMock.mock.calls[0][0]).toBe("https://3.basecampapi.com/5/my/profile.json");
  });

  it("is down without an HR connection or on an error reply", async () => {
    basecamp.getAccessToken.mockResolvedValueOnce(null);
    expect((await checks.checkBasecamp()).status).toBe("down");
    basecamp.getAccessToken.mockResolvedValue({ accessToken: "t", accountId: "5" });
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    expect(await checks.checkBasecamp()).toMatchObject({ status: "down", detail: "HTTP 503" });
  });
});

describe("AI Gateway", () => {
  it("is ok with credit and few failures", async () => {
    expect(await checks.checkAi(now)).toMatchObject({ status: "ok", detail: "Credit $25.50" });
  });

  it("is down with no credit, degraded when low or failing", async () => {
    ai.gateway.getCredits.mockResolvedValueOnce({ balance: "0", totalUsed: "1" });
    expect((await checks.checkAi(now)).status).toBe("down");
    ai.gateway.getCredits.mockResolvedValueOnce({ balance: "0.40", totalUsed: "1" });
    expect((await checks.checkAi(now)).status).toBe("degraded");
    db.aiUsage.groupBy.mockResolvedValueOnce([
      { ok: true, _count: 6 },
      { ok: false, _count: 4 },
    ]);
    expect(await checks.checkAi(now)).toMatchObject({ status: "degraded", detail: "4 of 10 AI calls failed in the last hour" });
  });

  it("is down when the Gateway doesn't answer", async () => {
    ai.gateway.getCredits.mockRejectedValueOnce(new Error("401"));
    expect((await checks.checkAi(now)).status).toBe("down");
  });
});

describe("email", () => {
  it("reads the last day's sends without sending anything", async () => {
    db.emailLog.groupBy.mockResolvedValueOnce([{ status: "SENT", _count: 4 }]);
    expect((await checks.checkEmail(now)).status).toBe("ok");
    db.emailLog.groupBy.mockResolvedValueOnce([
      { status: "SENT", _count: 4 },
      { status: "FAILED", _count: 1 },
    ]);
    expect((await checks.checkEmail(now)).status).toBe("degraded");
    db.emailLog.groupBy.mockResolvedValueOnce([{ status: "FAILED", _count: 3 }]);
    expect((await checks.checkEmail(now)).status).toBe("down");
  });
});

describe("background jobs", () => {
  const run = (path: string, ok: boolean) => ({ path, ok, startedAt: new Date("2026-10-14T05:00:00Z") });

  it("is degraded with a failing job and down with three", async () => {
    db.cronRun.findMany.mockResolvedValueOnce([run("/api/cron/leave-sync", false), run("/api/cron/chat-sync", true)]);
    expect(await checks.checkJobs(now)).toMatchObject({ status: "degraded", detail: "Failing: leave-sync" });
    db.cronRun.findMany.mockResolvedValueOnce([
      run("/api/cron/a", false),
      run("/api/cron/b", false),
      run("/api/cron/c", false),
    ]);
    expect((await checks.checkJobs(now)).status).toBe("down");
  });

  it("judges each job by its latest run", async () => {
    db.cronRun.findMany.mockResolvedValueOnce([
      { path: "/api/cron/leave-sync", ok: true, startedAt: new Date("2026-10-14T05:00:00Z") },
      { path: "/api/cron/leave-sync", ok: false, startedAt: new Date("2026-10-13T05:00:00Z") },
    ]);
    expect((await checks.checkJobs(now)).status).toBe("ok");
  });
});

describe("Basecamp sync", () => {
  it("uses the chat and Quantum Sheet sync times before any run is recorded", async () => {
    db.basecampChat.aggregate.mockResolvedValue({ _max: { lastCheckedAt: new Date("2026-10-14T05:55:00Z") } });
    db.appSetting.findUnique.mockResolvedValue({ value: { syncedThrough: "2026-10-13T23:15:00Z" } });
    expect((await checks.checkBasecampSync(now)).status).toBe("ok");
  });

  it("is degraded when chat hasn't synced for a while and down after a day", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: { syncedThrough: "2026-10-13T23:15:00Z" } });
    db.basecampChat.aggregate.mockResolvedValueOnce({ _max: { lastCheckedAt: new Date("2026-10-14T05:00:00Z") } });
    expect(await checks.checkBasecampSync(now)).toMatchObject({ status: "degraded", detail: "Chat: last sync 60 min ago" });
    db.basecampChat.aggregate.mockResolvedValueOnce({ _max: { lastCheckedAt: new Date("2026-10-12T05:00:00Z") } });
    expect((await checks.checkBasecampSync(now)).status).toBe("down");
  });
});

describe("runAllChecks", () => {
  it("returns every service even when one check throws", async () => {
    db.$queryRaw.mockResolvedValue([]);
    basecamp.getAccessToken.mockResolvedValue(null);
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));
    blob.list.mockResolvedValue({ blobs: [] });
    db.emailLog.groupBy.mockRejectedValue(new Error("boom"));
    db.basecampChat.aggregate.mockResolvedValue({ _max: { lastCheckedAt: now } });
    db.appSetting.findUnique.mockResolvedValue({ value: { syncedThrough: now.toISOString() } });
    const results = await checks.runAllChecks(now);
    expect(Object.keys(results).sort()).toEqual(
      ["ai", "app", "basecamp", "basecamp-sync", "database", "email", "jobs", "storage"].sort(),
    );
    expect(results.email).toMatchObject({ status: "down", detail: "boom" });
    expect(results.basecamp.status).toBe("down");
    expect(results.database.status).toBe("ok");
  });
});
