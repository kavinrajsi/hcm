import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { aiUsage: { create } } }));

const { fillDays, formatUsd, gatewayCost, istDay, rangeStart, recordAiUsage } =
  await import("./ai-usage");

beforeEach(() => vi.clearAllMocks());

describe("gatewayCost", () => {
  it("reads the Gateway's string cost and generation id", () => {
    expect(
      gatewayCost({ gateway: { cost: "0.0000007", generationId: "gen_1" } }),
    ).toEqual({ costUsd: 0.0000007, generationId: "gen_1" });
  });

  it("accepts a numeric cost", () => {
    expect(gatewayCost({ gateway: { cost: 0.25 } }).costUsd).toBe(0.25);
  });

  it("returns nulls when the metadata has no cost", () => {
    for (const meta of [undefined, null, {}, { gateway: {} }, { gateway: { cost: "n/a" } }]) {
      expect(gatewayCost(meta)).toEqual({ costUsd: null, generationId: null });
    }
  });
});

describe("formatUsd", () => {
  it("keeps tiny amounts readable", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.000421)).toBe("$0.00042");
    expect(formatUsd(1.234)).toBe("$1.23");
  });
});

describe("date ranges (Asia/Kolkata)", () => {
  // 2026-09-28 04:00 IST
  const now = new Date("2026-09-27T22:30:00Z");

  it("uses the IST calendar day", () => {
    expect(istDay(now)).toBe("2026-09-28");
  });

  it("starts this month at IST midnight on the 1st", () => {
    expect(rangeStart("month", now)?.toISOString()).toBe(
      "2026-08-31T18:30:00.000Z",
    );
  });

  it("covers 30 days including today", () => {
    expect(istDay(rangeStart("30d", now)!)).toBe("2026-08-30");
  });

  it("has no start for all time", () => {
    expect(rangeStart("all", now)).toBeNull();
  });
});

describe("fillDays", () => {
  it("zero-fills missing days", () => {
    expect(
      fillDays([{ day: "2026-09-02", cost: 0.5, requests: 3 }], "2026-09-01", "2026-09-03"),
    ).toEqual([
      { day: "2026-09-01", cost: 0, requests: 0 },
      { day: "2026-09-02", cost: 0.5, requests: 3 },
      { day: "2026-09-03", cost: 0, requests: 0 },
    ]);
  });
});

describe("recordAiUsage", () => {
  it("saves the call", async () => {
    await recordAiUsage({
      feature: "leave-classify",
      trigger: "webhook",
      model: "m",
      items: 2,
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
      generationId: "gen_1",
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        feature: "leave-classify",
        trigger: "webhook",
        model: "m",
        items: 2,
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0.001,
        generationId: "gen_1",
        ok: true,
        userId: null,
      },
    });
  });

  it("never throws when the insert fails", async () => {
    create.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordAiUsage({ feature: "x", model: "m", items: 1, ok: false }),
    ).resolves.toBeUndefined();
  });
});
