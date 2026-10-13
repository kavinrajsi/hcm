import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ cronRun: { create: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

const { withCronRun } = await import("./cron-runs");

const authorized = () => new NextRequest("https://h/api/cron/x", { headers: { authorization: "Bearer s" } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s";
  // Recording is skipped under NODE_ENV=test; turn it on for these tests.
  vi.stubEnv("NODE_ENV", "production");
});

describe("withCronRun", () => {
  it("records a successful run and returns the job's response unchanged", async () => {
    const response = Response.json({ synced: 3 });
    const result = await withCronRun("/api/cron/x", async () => response)(authorized());
    expect(result).toBe(response);
    expect(db.cronRun.create.mock.calls[0][0].data).toMatchObject({ path: "/api/cron/x", ok: true, error: null });
  });

  it("records a failed reply", async () => {
    await withCronRun("/api/cron/x", async () => Response.json({ error: "x" }, { status: 503 }))(authorized());
    expect(db.cronRun.create.mock.calls[0][0].data).toMatchObject({ ok: false, error: "HTTP 503" });
  });

  it("records a thrown error and still throws it", async () => {
    const run = withCronRun("/api/cron/x", async () => {
      throw new Error("Basecamp down");
    });
    await expect(run(authorized())).rejects.toThrow("Basecamp down");
    expect(db.cronRun.create.mock.calls[0][0].data).toMatchObject({ ok: false, error: "Basecamp down" });
  });

  it("doesn't record skipped runs or requests without the secret", async () => {
    await withCronRun("/api/cron/x", async () => Response.json({ skipped: "outside window" }))(authorized());
    await withCronRun("/api/cron/x", async () => new Response("Unauthorized", { status: 401 }))(
      new NextRequest("https://h/api/cron/x"),
    );
    expect(db.cronRun.create).not.toHaveBeenCalled();
  });

  it("never fails the job when recording fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.cronRun.create.mockRejectedValueOnce(new Error("db down"));
    const response = await withCronRun("/api/cron/x", async () => Response.json({ ok: true }))(authorized());
    expect(response.status).toBe(200);
  });
});
