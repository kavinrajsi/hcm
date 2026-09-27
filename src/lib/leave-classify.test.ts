import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.hoisted(() => vi.fn());
const recordAiUsage = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText,
}));
vi.mock("@/lib/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai-usage")>()),
  recordAiUsage,
}));
vi.mock("@/lib/db", () => ({ db: {} }));

const { classifyLeavePosts } = await import("./leave-classify");

const post = {
  id: "a",
  checkin: "wfh" as const,
  postedOn: "2026-09-28",
  postedAt: "2026-09-28T09:00:00+05:30",
  message: "WFH today",
};
const item = {
  id: "a",
  type: "WFH",
  startDate: "2026-09-28",
  endDate: "2026-09-28",
  days: 0,
  reason: "",
};

beforeEach(() => vi.clearAllMocks());

describe("classifyLeavePosts usage logging", () => {
  it("records tokens and the Gateway cost", async () => {
    generateText.mockResolvedValue({
      output: { items: [item, { ...item, id: "unknown" }] },
      usage: { inputTokens: 120, outputTokens: 30 },
      providerMetadata: { gateway: { cost: "0.00002", generationId: "gen_9" } },
    });
    const out = await classifyLeavePosts([post], "webhook");
    expect(out).toEqual([item]);
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "leave-classify",
        trigger: "webhook",
        items: 1,
        inputTokens: 120,
        outputTokens: 30,
        costUsd: 0.00002,
        generationId: "gen_9",
      }),
    );
  });

  it("records a failed request and rethrows", async () => {
    generateText.mockRejectedValue(new Error("429 rate limit"));
    await expect(classifyLeavePosts([post], "cron")).rejects.toThrow("429");
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "cron", ok: false, items: 1 }),
    );
  });

  it("skips the call for an empty batch", async () => {
    expect(await classifyLeavePosts([])).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
    expect(recordAiUsage).not.toHaveBeenCalled();
  });
});
