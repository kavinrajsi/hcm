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
      if (!url.includes("type=Todo&status=active")) return stops.push(await onPage([]));
      stops.push(await onPage([todo(1, "2026-10-12T09:00:00.000Z"), todo(2, "2026-10-11T00:00:00.000Z")]));
    });

    const result = await syncQuantumTodos({ updatedById: "u1" });

    expect(result).toMatchObject({ since: "2026-10-12T00:00:00.000Z", saved: 1, pages: 9 });
    expect(db.quantumTodo.upsert).toHaveBeenCalledTimes(1);
    expect(db.quantumTodo.upsert.mock.calls[0][0]).toMatchObject({ where: { basecampId: "1" }, create: { kind: "Todo" } });
    // Each type: active and archived stop at `since`, the trash is read in full.
    expect(stops).toEqual([true, true, false, true, true, false, true, true, false]);
    expect(
      basecamp.eachPage.mock.calls.map((call) => {
        const match = /type=([^&]+)&status=(\w+)/.exec(call[1]);
        return match ? `${decodeURIComponent(match[1])}/${match[2]}` : "timesheet";
      }),
    ).toEqual([
      "Todo/active",
      "Todo/archived",
      "Todo/trashed",
      "Kanban::Card/active",
      "Kanban::Card/archived",
      "Kanban::Card/trashed",
      "Kanban::Step/active",
      "Kanban::Step/archived",
      "Kanban::Step/trashed",
      "timesheet",
    ]);
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
    expect(stops).toEqual(Array(9).fill(false));
  });

  it("stores cards and steps with their kind", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: { syncedThrough: "2026-10-12T00:10:00.000Z" } });
    basecamp.eachPage.mockImplementation(async (_token, url: string, _agent, onPage) => {
      if (url.includes("type=Kanban%3A%3ACard&status=active"))
        await onPage([
          { ...todo(7, "2026-10-12T09:00:00.000Z"), type: "Kanban::Card", parent: { id: 3, title: "In progress", type: "Kanban::Column" } },
        ]);
    });
    await syncQuantumTodos();
    expect(db.quantumTodo.upsert.mock.calls[0][0]).toMatchObject({
      where: { basecampId: "7" },
      create: { kind: "Kanban::Card", listName: "In progress" },
    });
  });

  it("loads only the asked-for types and leaves the high-water mark alone", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: { syncedThrough: "2026-10-12T00:10:00.000Z" } });
    basecamp.eachPage.mockImplementation(async () => {});
    await syncQuantumTodos({ full: true, kinds: ["Kanban::Card", "Kanban::Step"] });
    const urls = basecamp.eachPage.mock.calls.map((call) => call[1] as string);
    expect(urls.some((url) => url.includes("type=Todo&"))).toBe(false);
    expect(urls.filter((url) => url.includes("recordings")).length).toBe(6);
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
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

  it("reports progress per step and page", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: { syncedThrough: "2026-10-12T00:10:00.000Z" } });
    basecamp.eachPage.mockImplementation(async (_token, url: string, _agent, onPage) => {
      if (url.includes("type=Todo&status=active")) await onPage([todo(1, "2026-10-12T09:00:00.000Z")]);
    });
    const progress: unknown[] = [];
    await syncQuantumTodos({ onProgress: (step) => progress.push(step) });
    expect(progress).toEqual([
      { stage: "todos", status: "active", pages: 0, saved: 0 },
      { stage: "todos", status: "active", pages: 1, saved: 1 },
      { stage: "todos", status: "archived", pages: 1, saved: 1 },
      { stage: "todos", status: "trashed", pages: 1, saved: 1 },
      { stage: "cards", status: "active", pages: 0, saved: 0 },
      { stage: "cards", status: "archived", pages: 0, saved: 0 },
      { stage: "cards", status: "trashed", pages: 0, saved: 0 },
      { stage: "steps", status: "active", pages: 0, saved: 0 },
      { stage: "steps", status: "archived", pages: 0, saved: 0 },
      { stage: "steps", status: "trashed", pages: 0, saved: 0 },
      { stage: "hours", hourEntries: null },
      { stage: "hours", hourEntries: 0 },
    ]);
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
  it("keeps hours logged on to-dos and cards and drops entries deleted in Basecamp", async () => {
    basecamp.eachPage.mockImplementation(async (_token, url: string, _agent, onPage) => {
      expect(url).toContain("start_date=2025-10-13&end_date=2026-10-13");
      await onPage([
        { id: 1, status: "active", date: "2026-10-07", hours: "1.5", description: " update the content ", parent: { id: 42, type: "Todo" }, person: { id: 5, name: "Ravi" } },
        { id: 2, status: "active", date: "2026-10-07", hours: "2.0", parent: { id: 9, type: "Message" } },
        { id: 4, status: "active", date: "2026-10-08", hours: "0.5", parent: { id: 77, type: "Kanban::Card" } },
        { id: 3, status: "trashed", date: "2026-10-07", hours: "1.0", parent: { id: 43, type: "Todo" } },
      ]);
    });

    const saved = await syncTimesheetHours({ accessToken: "t", accountId: "1" }, new Date("2026-10-13T06:00:00Z"));

    expect(saved).toBe(2); // the to-do and the card
    expect(db.quantumHours.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ todoBasecampId: "77", minutes: 30 }) }),
    );
    expect(db.quantumHours.upsert).toHaveBeenCalledWith({
      where: { basecampEntryId: "1" },
      create: expect.objectContaining({
        todoBasecampId: "42",
        minutes: 90,
        source: "basecamp",
        basecampEntryId: "1",
        personId: "5",
        note: "update the content",
      }),
      update: expect.objectContaining({ minutes: 90 }),
    });
    expect(db.quantumHours.deleteMany.mock.calls[0][0].where).toMatchObject({
      source: "basecamp",
      basecampEntryId: { notIn: ["1", "4"] },
    });
  });
});
