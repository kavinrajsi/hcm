import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sync = vi.hoisted(() => ({
  syncQuantumTodos: vi.fn(async () => ({ since: "2026-10-12T00:00:00.000Z", pages: 2, saved: 5 })),
}));
vi.mock("@/lib/quantum/sync", () => sync);

const { GET } = await import("./route");

const authorized = () =>
  new NextRequest("https://h/api/cron/quantum-sync", { headers: { authorization: "Bearer s" } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s";
});

describe("quantum-sync cron", () => {
  it("needs the cron secret", async () => {
    expect((await GET(new NextRequest("https://h/api/cron/quantum-sync"))).status).toBe(401);
    expect(sync.syncQuantumTodos).not.toHaveBeenCalled();
  });

  it("syncs what changed", async () => {
    expect(await (await GET(authorized())).json()).toMatchObject({ saved: 5 });
  });

  it("503s when Basecamp isn't connected", async () => {
    sync.syncQuantumTodos.mockRejectedValueOnce(new Error("No HR admin has connected Basecamp"));
    expect((await GET(authorized())).status).toBe(503);
  });
});
