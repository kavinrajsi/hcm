import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ emailLog: { findUnique: vi.fn(), findFirst: vi.fn() } }));
const sendEmail = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/rbac", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "hr1" }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { resendEmail } = await import("./actions");
const form = (id: string) => {
  const data = new FormData();
  data.set("id", id);
  return data;
};
const failed = {
  id: "e1",
  kind: "letter",
  status: "FAILED",
  resendable: true,
  from: "HCM <noreply@madarth.com>",
  to: ["a@x.com"],
  cc: [],
  replyTo: null,
  subject: "Offer",
  html: "<p>Hi</p>",
  employeeId: "emp1",
};

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue({ skipped: false, id: "r2" });
  db.emailLog.findFirst.mockResolvedValue({ id: "e2" });
});

describe("resendEmail", () => {
  it("resends a failed email as stored, linked to the original", async () => {
    db.emailLog.findUnique.mockResolvedValue(failed);
    await resendEmail({}, form("e1"));
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "letter", to: ["a@x.com"], html: "<p>Hi</p>", resendOfId: "e1", sentById: "hr1", employeeId: "emp1" }),
    );
    expect(redirect).toHaveBeenCalledWith("/email-log/e2");
  });

  it("won't resend sent or one-time-link emails", async () => {
    db.emailLog.findUnique.mockResolvedValue({ ...failed, status: "SENT" });
    expect((await resendEmail({}, form("e1"))).error).toMatch(/sent already/);
    db.emailLog.findUnique.mockResolvedValue({ ...failed, kind: "reset", resendable: false });
    expect((await resendEmail({}, form("e1"))).error).toMatch(/can't be resent/);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("revealWebhookUrl", () => {
  it("returns the URL with the key for HR", async () => {
    const { revealWebhookUrl } = await import("./actions");
    process.env.ZEPTOMAIL_WEBHOOK_SECRET = "abc";
    process.env.AUTH_URL = "https://connect.madarth.com";
    expect(await revealWebhookUrl()).toEqual({ url: "https://connect.madarth.com/api/webhooks/zeptomail?key=abc" });
    delete process.env.ZEPTOMAIL_WEBHOOK_SECRET;
    expect((await revealWebhookUrl()).error).toMatch(/isn't set/);
  });
});
