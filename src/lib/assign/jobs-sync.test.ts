import { beforeEach, describe, expect, it, vi } from "vitest";

// Jobs sync against mocked Basecamp and database.

const db = vi.hoisted(() => ({
  employee: { findMany: vi.fn() },
  job: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    aggregate: vi.fn(),
  },
  jobComment: { createMany: vi.fn() },
}));
const basecamp = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  listProjects: vi.fn(),
  listAllTodolists: vi.fn(),
  listCompletedTodos: vi.fn(),
  listComments: vi.fn(),
  listTodosUpdatedSince: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/basecamp", () => basecamp);
vi.mock("@/lib/leave-sync", () => ({
  leaveSyncUserId: vi.fn(async () => "hr-user"),
}));
vi.mock("@/lib/employee-pii", () => ({
  readPii: (row: { personalEmail: string | null }) => ({
    personalEmail: row.personalEmail,
  }),
}));

const { syncBasecampJobs, summarizeJobsSync } = await import("./jobs-sync");

const todo = (overrides: Record<string, unknown> = {}) => ({
  id: 101,
  title: "Meta banner",
  description: "<p>1200x628</p>",
  app_url: "https://bc/todos/101",
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-02T10:00:00.000Z",
  completed: true,
  completion: {
    created_at: "2026-09-02T10:00:00.000Z",
    creator: { id: 9, name: "Manoj" },
  },
  comments_count: 2,
  parent: { id: 5, title: "September", type: "Todolist" },
  bucket: { id: 7, name: "Valam" },
  creator: { id: 1, name: "Ananth", email_address: "Ananth@madarth.com" },
  assignees: [
    { id: 2, name: "Sunil", email_address: "sunil@madarth.com", title: "Graphic Designer" },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  basecamp.getAccessToken.mockResolvedValue({ accessToken: "t", accountId: "a" });
  basecamp.listProjects.mockResolvedValue([{ id: 7, name: "Valam", dock: [] }]);
  basecamp.listAllTodolists.mockResolvedValue([{ id: 5, title: "September" }]);
  basecamp.listComments.mockResolvedValue([
    {
      id: 900,
      content: "<div>Logo is wrong</div>",
      created_at: "2026-09-01T11:00:00.000Z",
      app_url: "https://bc/c/900",
      creator: { id: 1, name: "Ananth", email_address: "ananth@madarth.com" },
    },
  ]);
  db.employee.findMany.mockResolvedValue([
    { id: "e-sunil", workEmail: "sunil@madarth.com", personalEmail: null, personalEmailEnc: null },
  ]);
  db.job.findMany.mockResolvedValue([]);
  db.job.aggregate.mockResolvedValue({ _max: { basecampUpdatedAt: null } });
  db.job.create.mockResolvedValue({ id: "job-1" });
  db.job.update.mockResolvedValue({ id: "job-1" });
  db.jobComment.createMany.mockResolvedValue({ count: 1 });
});

describe("syncBasecampJobs", () => {
  it("creates a job with assignees linked to employees and its comments", async () => {
    basecamp.listCompletedTodos.mockResolvedValue([todo()]);
    const events: unknown[] = [];
    const result = await syncBasecampJobs((event) => events.push(event));

    expect(db.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          basecampTodoId: "101",
          bucketName: "Valam",
          description: "1200x628",
          creatorEmail: "ananth@madarth.com",
          completedBy: "Manoj",
          assignees: {
            create: [
              expect.objectContaining({
                personId: "2",
                employeeId: "e-sunil",
                title: "Graphic Designer",
              }),
            ],
          },
        }),
      }),
    );
    expect(db.jobComment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          basecampId: "900",
          jobId: "job-1",
          content: "Logo is wrong",
        }),
      ],
      skipDuplicates: true,
    });
    expect(result).toMatchObject({ todos: 1, created: 1, comments: 1, failed: 0 });
    expect(events).toContainEqual({ type: "total", total: 1 });
    expect(summarizeJobsSync(result)).toBe(
      "1 completed to-dos in 1 projects · 1 new · 0 updated · 1 comments added",
    );
  });

  it("skips a to-do that hasn't changed and refetches comments when the count moved", async () => {
    basecamp.listCompletedTodos.mockResolvedValue([
      todo(),
      todo({ id: 102, title: "Poster", comments_count: 3 }),
    ]);
    db.job.findMany.mockResolvedValue([
      {
        id: "job-1",
        basecampTodoId: "101",
        basecampUpdatedAt: new Date("2026-09-02T10:00:00.000Z"),
        commentsCount: 2,
      },
      {
        id: "job-2",
        basecampTodoId: "102",
        basecampUpdatedAt: new Date("2026-09-02T10:00:00.000Z"),
        commentsCount: 1,
      },
    ]);
    const result = await syncBasecampJobs();
    expect(db.job.create).not.toHaveBeenCalled();
    expect(db.job.update).toHaveBeenCalledTimes(1);
    expect(basecamp.listComments).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ unchanged: 1, updated: 1 });
  });

  it("reports a failed to-do and keeps going", async () => {
    basecamp.listCompletedTodos.mockResolvedValue([todo(), todo({ id: 102 })]);
    db.job.create
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ id: "job-2" });
    const events: { type: string; status?: string }[] = [];
    const result = await syncBasecampJobs((event) => events.push(event));
    expect(result).toMatchObject({ created: 1, failed: 1 });
    expect(events.filter((event) => event.status === "failed")).toHaveLength(1);
  });

  it("leaves the rest for next time when the budget is gone", async () => {
    basecamp.listCompletedTodos.mockResolvedValue([todo(), todo({ id: 102 })]);
    const result = await syncBasecampJobs(() => {}, { budgetMs: -1 });
    expect(result.skipped).toBe(2);
    expect(db.job.create).not.toHaveBeenCalled();
  });

  it("after the first import, reads only completed to-dos updated since the newest one", async () => {
    db.job.aggregate.mockResolvedValue({
      _max: { basecampUpdatedAt: new Date("2026-09-30T12:00:00.000Z") },
    });
    basecamp.listTodosUpdatedSince.mockResolvedValue([
      todo({ completion: null }),
      todo({ id: 103, completed: false }),
    ]);
    const result = await syncBasecampJobs();
    expect(basecamp.listAllTodolists).not.toHaveBeenCalled();
    // One day of overlap before the newest synced update.
    expect(basecamp.listTodosUpdatedSince).toHaveBeenCalledWith(
      "t",
      "a",
      new Date("2026-09-29T12:00:00.000Z"),
    );
    expect(result).toMatchObject({ todos: 1, created: 1 });
    expect(db.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completedAt: new Date("2026-09-02T10:00:00.000Z"),
          completedBy: null,
        }),
      }),
    );
  });

  it("walks every project when asked for a full sync", async () => {
    db.job.aggregate.mockResolvedValue({
      _max: { basecampUpdatedAt: new Date("2026-09-30T12:00:00.000Z") },
    });
    basecamp.listCompletedTodos.mockResolvedValue([todo()]);
    await syncBasecampJobs(() => {}, { full: true });
    expect(basecamp.listTodosUpdatedSince).not.toHaveBeenCalled();
    expect(basecamp.listAllTodolists).toHaveBeenCalled();
  });
});
