import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const counts = vi.hoisted(() => ({
  syncOpenTodoCounts: vi.fn(async () => ({ synced: 60, failed: 1 })),
}));
vi.mock("@/lib/basecamp-todo-counts", () => counts);

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s";
});

describe("basecamp-todo-counts cron", () => {
  it("needs the cron secret", async () => {
    expect((await GET(new NextRequest("https://h/api/cron/basecamp-todo-counts"))).status).toBe(401);
    expect(counts.syncOpenTodoCounts).not.toHaveBeenCalled();
  });

  it("syncs the counts", async () => {
    const response = await GET(
      new NextRequest("https://h/api/cron/basecamp-todo-counts", { headers: { authorization: "Bearer s" } }),
    );
    expect(await response.json()).toEqual({ synced: 60, failed: 1 });
  });

  it("503s when Basecamp isn't connected", async () => {
    counts.syncOpenTodoCounts.mockRejectedValueOnce(new Error("No HR admin has connected Basecamp"));
    const response = await GET(
      new NextRequest("https://h/api/cron/basecamp-todo-counts", { headers: { authorization: "Bearer s" } }),
    );
    expect(response.status).toBe(503);
  });
});
