import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ emailLog: { deleteMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret";
  db.emailLog.deleteMany.mockResolvedValue({ count: 3 });
});

describe("email log cleanup", () => {
  it("needs the cron secret", async () => {
    expect((await GET(new NextRequest("https://h/api/cron/email-log-cleanup"))).status).toBe(401);
  });

  it("deletes entries older than a year", async () => {
    const response = await GET(
      new NextRequest("https://h/api/cron/email-log-cleanup", { headers: { authorization: "Bearer cron-secret" } }),
    );
    expect((await response.json()).deleted).toBe(3);
    const before: Date = db.emailLog.deleteMany.mock.calls[0][0].where.createdAt.lt;
    const days = (Date.now() - before.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(365);
  });
});
