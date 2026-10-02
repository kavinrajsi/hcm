import { beforeEach, describe, expect, it, vi } from "vitest";

// Comment classification against a mocked model.

const ai = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: ai.generateText,
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/ai-usage", () => ({
  recordAiUsage: vi.fn(),
  gatewayCost: () => ({}),
}));

import { classifyComments } from "./classify";

const comment = (id: string, text: string) => ({
  id,
  jobTitle: "Diwali post",
  author: "Coordinator",
  role: "coordinator" as const,
  text,
});

describe("classifyComments", () => {
  beforeEach(() => ai.generateText.mockReset());

  it("labels empty comments as handoffs without asking the model", async () => {
    const result = await classifyComments([comment("a", ""), comment("b", "  \n")]);
    expect(ai.generateText).not.toHaveBeenCalled();
    expect(result).toEqual([
      { id: "a", labels: ["HANDOFF"] },
      { id: "b", labels: ["HANDOFF"] },
    ]);
  });

  it("sends only comments with text to the model", async () => {
    ai.generateText.mockResolvedValue({
      output: { items: [{ id: "b", labels: ["CORRECTION"] }] },
      usage: { inputTokens: 1, outputTokens: 1 },
      providerMetadata: {},
    });
    const result = await classifyComments([comment("a", ""), comment("b", "Logo is wrong")]);
    const prompt = JSON.parse(ai.generateText.mock.calls[0][0].prompt);
    expect(prompt.map((item: { id: string }) => item.id)).toEqual(["b"]);
    expect(result).toEqual([
      { id: "a", labels: ["HANDOFF"] },
      { id: "b", labels: ["CORRECTION"] },
    ]);
  });
});
