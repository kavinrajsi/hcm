import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const syncBasecampPeople = vi.hoisted(() => vi.fn());
vi.mock("@/lib/basecamp-people", () => ({ syncBasecampPeople }));

const { GET } = await import("./route");

const request = (authorization?: string) =>
  ({
    headers: new Headers(authorization ? { authorization } : {}),
  }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret";
});

describe("basecamp-people cron", () => {
  it("rejects requests without the cron secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    expect(syncBasecampPeople).not.toHaveBeenCalled();
  });

  it("runs the sync and returns counts", async () => {
    syncBasecampPeople.mockResolvedValue({
      people: 3,
      matched: 2,
      updated: 1,
      unchanged: 1,
      unmatched: [{ name: "Guest", email: "g@x.com" }],
      failed: 0,
    });
    const response = await GET(request("Bearer cron-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ matched: 2, unmatched: 1 });
  });
});
