import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ emailLog: { findFirst: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

const { applyWebhook, deliveryFor, isResendable, redactEmailHtml } = await import("./email-log");

beforeEach(() => vi.clearAllMocks());

describe("redactEmailHtml", () => {
  it("removes one-time links, keeps normal ones", () => {
    const html =
      '<a href="https://connect.madarth.com/reset-password?token=abc123">Set</a> <a href="https://connect.madarth.com/probation">Open</a>';
    const out = redactEmailHtml(html);
    expect(out).not.toContain("abc123");
    expect(out).toContain("https://connect.madarth.com/probation");
  });

  it("knows what can be resent", () => {
    expect(isResendable("letter", "<p>Hi</p>", 0)).toBe(true);
    expect(isResendable("reset", "<p>Hi</p>", 0)).toBe(false);
    expect(isResendable("letter", "<p>Hi</p>", 1)).toBe(false);
    expect(isResendable("letter", '<a href="https://x.com/a?token=1">x</a>', 0)).toBe(false);
  });
});

describe("ZeptoMail events", () => {
  it("maps event names", () => {
    expect(deliveryFor("hard bounce")).toBe("BOUNCED");
    expect(deliveryFor("softbounce")).toBe("BOUNCED");
    expect(deliveryFor("email opens")).toBe("OPENED");
    expect(deliveryFor("email clicks")).toBe("OPENED");
    expect(deliveryFor("feedback loop")).toBeNull();
  });

  const bounce = {
    event_name: ["hardbounce"],
    event_message: [{ email_info: { email_reference: "x" }, event_data: [{ details: [{ reason: "Mailbox not found" }] }] }],
    request_id: "req-1",
  };

  it("records a bounce on the matching email", async () => {
    db.emailLog.findFirst.mockResolvedValue({ id: "e1", delivery: "OPENED", events: [] });
    expect(await applyWebhook({ ...bounce, event_name: "hard bounce" })).toBe(true);
    const data = db.emailLog.update.mock.calls[0][0].data;
    expect(data.delivery).toBe("BOUNCED");
    expect(data.events[0]).toMatchObject({ type: "hard bounce", detail: "Mailbox not found" });
  });

  it("an open never hides a bounce", async () => {
    db.emailLog.findFirst.mockResolvedValue({ id: "e1", delivery: "BOUNCED", events: [] });
    await applyWebhook({ event_name: "email opens", request_id: "req-1" });
    expect(db.emailLog.update.mock.calls[0][0].data.delivery).toBeUndefined();
  });

  it("ignores events for unknown emails", async () => {
    db.emailLog.findFirst.mockResolvedValue(null);
    expect(await applyWebhook({ event_name: "email opens", request_id: "nope" })).toBe(false);
    expect(await applyWebhook({ nothing: true })).toBe(false);
    expect(db.emailLog.update).not.toHaveBeenCalled();
  });
});
