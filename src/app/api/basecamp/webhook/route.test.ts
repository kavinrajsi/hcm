import { beforeEach, describe, expect, it, vi } from "vitest";

const syncOneAnswer = vi.hoisted(() => vi.fn());
const leaveSyncUserId = vi.hoisted(() => vi.fn());
const classifyPending = vi.hoisted(() => vi.fn());
const after = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/leave-sync", () => ({
  syncOneAnswer,
  leaveSyncUserId,
  classifyPending,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after,
}));

const { POST } = await import("./route");

// Default leave check-in: bucket 1710547, question 2113472792 (WFH: 7274378266).
const answerEvent = (kind = "question_answer_created", overrides = {}) => ({
  kind,
  recording: {
    id: 555,
    type: "Question::Answer",
    parent: { id: 2113472792 },
    bucket: { id: 1710547 },
    ...overrides,
  },
});

function call(body: unknown, token: string | null = "s3cret") {
  const url = new URL("https://hcm.test/api/basecamp/webhook");
  if (token !== null) url.searchParams.set("token", token);
  return POST(
    Object.assign(
      new Request(url, { method: "POST", body: JSON.stringify(body) }),
      {
        nextUrl: url,
      },
    ) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BASECAMP_WEBHOOK_SECRET = "s3cret";
  leaveSyncUserId.mockResolvedValue("hr1");
  syncOneAnswer.mockResolvedValue({ created: 1, updated: 0 });
});

describe("Basecamp leave webhook", () => {
  it("rejects a missing or wrong token", async () => {
    expect((await call(answerEvent(), null)).status).toBe(401);
    expect((await call(answerEvent(), "nope")).status).toBe(401);
    expect(syncOneAnswer).not.toHaveBeenCalled();
  });

  it("rejects everything when the secret isn't configured", async () => {
    delete process.env.BASECAMP_WEBHOOK_SECRET;
    expect((await call(answerEvent(), "")).status).toBe(401);
  });

  it("ingests a new answer by id and classifies after responding", async () => {
    const response = await call(answerEvent());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ created: 1, updated: 0 });
    expect(syncOneAnswer).toHaveBeenCalledWith("hr1", "555");
    expect(after).toHaveBeenCalledOnce();
  });

  it("ingests answers from the WFH check-in", async () => {
    const response = await call(
      answerEvent("question_answer_created", { parent: { id: 7274378266 } }),
    );
    expect(response.status).toBe(200);
    expect(syncOneAnswer).toHaveBeenCalledWith("hr1", "555");
  });

  it("handles edits too", async () => {
    await call(answerEvent("question_answer_content_updated"));
    expect(syncOneAnswer).toHaveBeenCalledWith("hr1", "555");
  });

  it.each([
    [
      "another check-in",
      answerEvent("question_answer_created", { parent: { id: 1 } }),
    ],
    [
      "another project",
      answerEvent("question_answer_created", { bucket: { id: 2 } }),
    ],
    ["a trashed answer", answerEvent("question_answer_trashed")],
    [
      "a message",
      { kind: "message_created", recording: { id: 1, type: "Message" } },
    ],
    ["junk", { hello: "world" }],
  ])("acknowledges but ignores %s", async (_, body) => {
    const response = await call(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
    expect(syncOneAnswer).not.toHaveBeenCalled();
  });

  it("returns 503 (so Basecamp retries) when nobody has connected Basecamp", async () => {
    leaveSyncUserId.mockResolvedValue(null);
    expect((await call(answerEvent())).status).toBe(503);
  });
});
