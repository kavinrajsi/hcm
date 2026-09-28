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
const jevLeaveTypes = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/lib/leave-type-jev", () => ({ jevLeaveTypes }));

const { applyJevType, classifyLeavePosts } = await import("./leave-classify");

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

describe("Jev leave type", () => {
  const full = { ...item, type: "FULL_DAY" as const, days: 2 };

  it("keeps the language model's answer when Jev agrees or has none", () => {
    expect(applyJevType(full, undefined)).toBe(full);
    expect(applyJevType(full, "FULL_DAY")).toBe(full);
  });

  it("takes Jev's type and fixes days to match", () => {
    expect(applyJevType(full, "HALF_DAY")).toMatchObject({
      type: "HALF_DAY",
      days: 0.5,
    });
    expect(applyJevType(full, "WFH")).toMatchObject({ type: "WFH", days: 0 });
    expect(
      applyJevType({ ...item, type: "WFH", days: 0 }, "FULL_DAY"),
    ).toMatchObject({ type: "FULL_DAY", days: 1 });
  });

  it("overrides the type in classifyLeavePosts", async () => {
    generateText.mockResolvedValue({
      output: { items: [item] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    jevLeaveTypes.mockResolvedValueOnce(new Map([["a", "HALF_DAY"]]) as never);
    const [out] = await classifyLeavePosts([post]);
    expect(out).toMatchObject({ type: "HALF_DAY", days: 0.5 });
  });
});
