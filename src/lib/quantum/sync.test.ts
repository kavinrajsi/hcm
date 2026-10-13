import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  quantumTodo: { upsert: vi.fn((args: unknown) => args) },
  quantumHours: { upsert: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
const basecamp = vi.hoisted(() => ({
  getAccessToken: vi.fn(async () => ({ accessToken: "t", accountId: "1" })),
  eachPage: vi.fn(),
}));
vi.mock("@/lib/basecamp", () => basecamp);
vi.mock("@/lib/leave-sync", () => ({ leaveSyncUserId: vi.fn(async () => "hr-1") }));

const { syncQuantumTodos, syncStart, syncTimesheetHours } = await import("./sync");

const todo = (id: number, updated: string) => ({
  id,
  status: "active",
  title: `To-do ${id}`,
  app_url: `https://3.basecamp.com/1/todos/${id}`,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: updated,
  completed: false,
  due_on: null,
  starts_on: null,
  parent: { id: 9, title: "List", type: "Todolist" },
  bucket: { id: 7, name: "Acme" },
  assignees: [],
});

beforeEach(() => vi.clearAllMocks());

describe("syncStart", () => {
  const now = new Date("2026-10-13T00:00:00Z");
  it("goes back 12 months on the first run or a full run", () => {
    expect(syncStart(undefined, now).toISOString()).toBe("2025-10-13T00:00:00.000Z");
    expect(syncStart("2026-10-12T00:00:00Z", now, true).toISOString()).toBe("2025-10-13T00:00:00.000Z");
  });
  it("otherwise starts 10 minutes before the last finished sync", () => {
    expect(syncStart("2026-10-12T00:00:00Z", now).toISOString()).toBe("2026-10-11T23:50:00.000Z");
  });
});

describe("syncQuantumTodos", () => {
  it("saves what changed since the last sync and stops paging there", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: { syncedThrough: "2026-10-12T00:10:00.000Z" } });
    const stops: unknown[] = [];
    basecamp.eachPage.mockImplementation(async (_token, url: string, _agent, onPage) => {
      if (url.includes("timesheet")) return;
      if (!url.includes("status=active")) return stops.push(await onPage([]));
      stops.push(await onPage([todo(1, "2026-10-12T09:00:00.000Z"), todo(2, "2026-10-11T00:00:00.000Z")]));
    });

    const result = await syncQuantumTodos({ updatedById: "u1" });

    expect(result).toMatchObject({ since: "2026-10-12T00:00:00.000Z", saved: 1, pages: 3 });
    expect(db.quantumTodo.upsert).toHaveBeenCalledTimes(1);
    expect(db.quantumTodo.upsert.mock.calls[0][0]).toMatchObject({ where: { basecampId: "1" } });
    expect(stops).toEqual([true, true, false]);
    expect(
      basecamp.eachPage.mock.calls.map((call) => /status=(\w+)/.exec(call[1])?.[1] ?? "timesheet"),
    ).toEqual(["active", "archived", "trashed", "timesheet"]);
    expect(db.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "quantum.sync" } }),
    );
  });

  it("keeps paging while a whole page is newer", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: { syncedThrough: "2026-10-12T00:10:00.000Z" } });
    const stops: unknown[] = [];
    basecamp.eachPage.mockImplementation(async (_token, url: string, _agent, onPage) => {
      if (url.includes("timesheet")) return;
      stops.push(await onPage([todo(1, "2026-10-12T09:00:00.000Z")]));
    });
    await syncQuantumTodos();
    expect(stops).toEqual([false, false, false]);
  });

  it("reads the whole trash, however old", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: { syncedThrough: "2026-10-12T00:10:00.000Z" } });
    basecamp.eachPage.mockImplementation(async (_token, url: string, _agent, onPage) => {
      if (url.includes("status=trashed"))
        await onPage([{ ...todo(3, "2025-12-01T00:00:00.000Z"), status: "trashed" }]);
    });
    await syncQuantumTodos();
    expect(db.quantumTodo.upsert.mock.calls[0][0]).toMatchObject({
      where: { basecampId: "3" },
      update: { status: "trashed" },
    });
  });

  it("doesn't move the high-water mark when Basecamp fails", async () => {
    db.appSetting.findUnique.mockResolvedValue(null);
    basecamp.eachPage.mockRejectedValue(new Error("Basecamp fetch failed: 500"));
    await expect(syncQuantumTodos()).rejects.toThrow("500");
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("needs a connected HR admin", async () => {
    basecamp.getAccessToken.mockResolvedValueOnce(null as never);
    await expect(syncQuantumTodos()).rejects.toThrow("No HR admin has connected Basecamp");
  });
});

describe("syncTimesheetHours", () => {
  it("keeps hours logged on to-dos and drops entries deleted in Basecamp", async () => {
    basecamp.eachPage.mockImplementation(async (_token, url: string, _agent, onPage) => {
      expect(url).toContain("start_date=2025-10-13&end_date=2026-10-13");
      await onPage([
        { id: 1, status: "active", date: "2026-10-07", hours: "1.5", parent: { id: 42, type: "Todo" }, person: { id: 5, name: "Ravi" } },
        { id: 2, status: "active", date: "2026-10-07", hours: "2.0", parent: { id: 9, type: "Message" } },
        { id: 3, status: "trashed", date: "2026-10-07", hours: "1.0", parent: { id: 43, type: "Todo" } },
      ]);
    });

    const saved = await syncTimesheetHours({ accessToken: "t", accountId: "1" }, new Date("2026-10-13T06:00:00Z"));

    expect(saved).toBe(1);
    expect(db.quantumHours.upsert).toHaveBeenCalledWith({
      where: { basecampEntryId: "1" },
      create: expect.objectContaining({ todoBasecampId: "42", minutes: 90, source: "basecamp", basecampEntryId: "1" }),
      update: expect.objectContaining({ minutes: 90 }),
    });
    expect(db.quantumHours.deleteMany.mock.calls[0][0].where).toMatchObject({
      source: "basecamp",
      basecampEntryId: { notIn: ["1"] },
    });
  });
});
