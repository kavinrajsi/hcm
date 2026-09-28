import { beforeEach, describe, expect, it, vi } from "vitest";

const evaluate = vi.hoisted(() => vi.fn());
const recordAiUsage = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  experimental_evaluate: evaluate,
}));
vi.mock("@/lib/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai-usage")>()),
  recordAiUsage,
}));
vi.mock("@/lib/db", () => ({ db: {} }));

const { jevLeaveTypes, resetJevBackoff } = await import("./leave-type-jev");

const posts = [
  {
    id: "a",
    checkin: "leave" as const,
    postedOn: "2026-09-28",
    postedAt: "2026-09-28T09:00:00+05:30",
    message: "Half day today, doctor visit",
  },
  {
    id: "b",
    checkin: "wfh" as const,
    postedOn: "2026-09-28",
    postedAt: "2026-09-28T09:05:00+05:30",
    message: "Not sure yet",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  resetJevBackoff();
});

describe("jevLeaveTypes", () => {
  it("asks one question per post and keeps confident answers", async () => {
    evaluate.mockResolvedValue({
      answers: {
        post0: {
          type: "choice",
          choice: "HALF_DAY",
          probabilities: { HALF_DAY: 0.9 },
        },
        post1: {
          type: "choice",
          choice: "OTHER",
          probabilities: { OTHER: 0.4 },
        },
      },
      usage: { inputTokens: 200, outputTokens: 0 },
      providerMetadata: { gateway: { cost: "0.0000084" } },
    });
    const types = await jevLeaveTypes(posts, "webhook");
    expect(types).toEqual(new Map([["a", "HALF_DAY"]]));
    expect(Object.keys(evaluate.mock.calls[0][0].questions)).toEqual([
      "post0",
      "post1",
    ]);
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "leave-type-jev",
        model: "typesafe-ai/jev",
        items: 2,
        inputTokens: 200,
        costUsd: 0.0000084,
      }),
    );
  });

  it("returns null on failure and backs off instead of retrying", async () => {
    evaluate.mockRejectedValue(new Error("Free tier users do not have access"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await jevLeaveTypes(posts)).toBeNull();
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "leave-type-jev", ok: false }),
    );
    expect(await jevLeaveTypes(posts)).toBeNull();
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});
