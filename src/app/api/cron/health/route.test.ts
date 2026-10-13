import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ healthCheck: { createMany: vi.fn(), deleteMany: vi.fn(async () => ({ count: 2 })) } }));
vi.mock("@/lib/db", () => ({ db }));
const checks = vi.hoisted(() => ({
  runAllChecks: vi.fn(async () => ({
    database: { status: "ok", latencyMs: 12, detail: null },
    basecamp: { status: "down", latencyMs: 8000, detail: "No answer in 8 s" },
  })),
}));
vi.mock("@/lib/status/checks", () => checks);

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s";
});

describe("health cron", () => {
  it("needs the cron secret", async () => {
    expect((await GET(new NextRequest("https://h/api/cron/health"))).status).toBe(401);
    expect(checks.runAllChecks).not.toHaveBeenCalled();
  });

  it("stores one row per service and prunes old ones", async () => {
    const response = await GET(new NextRequest("https://h/api/cron/health", { headers: { authorization: "Bearer s" } }));
    expect(await response.json()).toEqual({ checked: { database: "ok", basecamp: "down" }, pruned: 2 });
    expect(db.healthCheck.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ service: "database", status: "ok", latencyMs: 12 }),
      expect.objectContaining({ service: "basecamp", status: "down", detail: "No answer in 8 s" }),
    ]);
  });
});
