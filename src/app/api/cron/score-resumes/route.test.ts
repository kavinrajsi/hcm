import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Run = { limit: number; deadline: number; trigger: string };
const score = vi.hoisted(() => ({
  scorePending: vi.fn<(run: Run) => Promise<Record<string, number>>>(async () => ({
    SCORED: 2,
    NO_RESUME: 1,
    FAILED: 0,
  })),
}));
vi.mock("@/lib/candidates/score", () => score);

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s";
  // 03:30 IST, inside the 02:00–08:00 window.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T22:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("score-resumes cron", () => {
  it("needs the cron secret", async () => {
    expect((await GET(new NextRequest("https://h/api/cron/score-resumes"))).status).toBe(401);
    expect(score.scorePending).not.toHaveBeenCalled();
  });

  it("scores pending resumes within a time budget", async () => {
    const response = await GET(new NextRequest("https://h/api/cron/score-resumes", { headers: { authorization: "Bearer s" } }));
    expect(await response.json()).toEqual({ SCORED: 2, NO_RESUME: 1, FAILED: 0 });
    const { deadline, trigger } = score.scorePending.mock.calls[0][0];
    expect(trigger).toBe("cron");
    expect(deadline - Date.now()).toBeLessThanOrEqual(200_000);
  });

  it("skips runs outside 02:00–08:00 IST", async () => {
    vi.setSystemTime(new Date("2026-10-07T06:00:00Z")); // 11:30 IST
    const response = await GET(new NextRequest("https://h/api/cron/score-resumes", { headers: { authorization: "Bearer s" } }));
    expect(await response.json()).toEqual({ skipped: "outside 02:00–08:00 IST" });
    expect(score.scorePending).not.toHaveBeenCalled();
  });
});
