import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const syncBasecampJobs = vi.hoisted(() => vi.fn());
const classifyPending = vi.hoisted(() => vi.fn());
vi.mock("@/lib/assign/jobs-sync", () => ({ syncBasecampJobs }));
vi.mock("@/lib/assign/classify", () => ({ classifyPending }));

const { GET } = await import("./route");

const request = (authorization?: string) =>
  ({
    headers: new Headers(authorization ? { authorization } : {}),
  }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret";
});

describe("basecamp-jobs cron", () => {
  it("rejects requests without the cron secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    expect(syncBasecampJobs).not.toHaveBeenCalled();
  });

  it("syncs then classifies, and returns both counts", async () => {
    syncBasecampJobs.mockResolvedValue({ todos: 4, created: 1 });
    classifyPending.mockResolvedValue({
      jobs: 1,
      comments: 3,
      remaining: { jobs: 0, comments: 0 },
    });
    const response = await GET(request("Bearer cron-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sync: { todos: 4, created: 1 },
      classified: { jobs: 1, comments: 3, remaining: { jobs: 0, comments: 0 } },
    });
    expect(classifyPending).toHaveBeenCalledWith(expect.any(Number), "cron");
  });

  it("returns 503 when Basecamp isn't connected", async () => {
    syncBasecampJobs.mockRejectedValue(new Error("Basecamp isn't connected"));
    expect((await GET(request("Bearer cron-secret"))).status).toBe(503);
  });
});
