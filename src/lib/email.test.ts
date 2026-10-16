import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ emailLog: { create: vi.fn() }, appSetting: { findUnique: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
const smtp = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), createTransport: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.createTransport } }));
const decryptField = vi.hoisted(() => vi.fn());
vi.mock("@/lib/crypto", () => ({ decryptField }));

import {
  emailTransportStatus,
  parseSender,
  readEmailRouting,
  readEmailTransport,
  readSmtpSettings,
  sendEmail,
  TURNED_OFF_REASON,
} from "./email";

const SMTP = {
  host: "smtp.zoho.com",
  port: 465,
  username: "noreply@madarth.com",
  passwordEncrypted: "k1:enc",
  fromAddress: "noreply@madarth.com",
  fromName: "HCM",
};
/** Answers appSetting lookups by key, like the real table. */
function settings(values: Record<string, unknown>) {
  db.appSetting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
    where.key in values ? { value: values[where.key] } : null,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ request_id: "r1", message: "OK" }), {
      status: 201,
    }),
  );
  process.env.ZEPTOMAIL_TOKEN = "Zoho-enczapikey abc123";
  delete process.env.ZEPTOMAIL_API_URL;
  process.env.EMAIL_FROM = "HCM <noreply@madarth.com>";
  db.appSetting.findUnique.mockResolvedValue(null);
  smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail, close: smtp.close });
  smtp.sendMail.mockResolvedValue({ messageId: "<m1@madarth.com>" });
  decryptField.mockReturnValue("app-pass");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  db.emailLog.create.mockReset();
  db.appSetting.findUnique.mockReset();
  smtp.createTransport.mockReset();
  smtp.sendMail.mockReset();
  smtp.close.mockReset();
  fetchMock.mockReset();
});

function sentBody() {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("parseSender", () => {
  it("splits 'Name <address>'", () => {
    expect(parseSender("HCM <noreply@madarth.com>")).toEqual({
      name: "HCM",
      address: "noreply@madarth.com",
    });
  });

  it("accepts a bare address", () => {
    expect(parseSender(" hr@madarth.com ")).toEqual({
      address: "hr@madarth.com",
    });
  });
});

describe("sendEmail (ZeptoMail)", () => {
  it("skips quietly when ZEPTOMAIL_TOKEN is unset", async () => {
    delete process.env.ZEPTOMAIL_TOKEN;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" })).toEqual({
      skipped: true,
      reason: "Email isn't set up (ZEPTOMAIL_TOKEN).",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts ZeptoMail's message format with the token header", async () => {
    const result = await sendEmail({ kind: "letter",
      to: ["a@x.com", "b@x.com"],
      subject: "Hello",
      html: "<b>Hi</b>",
    });
    expect(result).toEqual({ skipped: false, id: "r1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cpaas.zoho.com/v1.1/email");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Zoho-enczapikey abc123");
    expect(sentBody()).toEqual({
      from: { address: "noreply@madarth.com", name: "HCM" },
      to: [
        { email_address: { address: "a@x.com" } },
        { email_address: { address: "b@x.com" } },
      ],
      subject: "Hello",
      htmlbody: "<b>Hi</b>",
    });
  });

  it("adds the Zoho-enczapikey prefix when only the key is set", async () => {
    process.env.ZEPTOMAIL_TOKEN = "abc123";
    await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Zoho-enczapikey abc123",
    );
  });

  it("uses ZEPTOMAIL_API_URL when set", async () => {
    process.env.ZEPTOMAIL_API_URL = "https://api.zeptomail.in/v1.1/email";
    await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.zeptomail.in/v1.1/email",
    );
  });

  it("sends attachments as base64 with a mime type", async () => {
    await sendEmail({ kind: "letter",
      to: "a@x.com",
      subject: "Offer",
      html: "H",
      attachments: [{ filename: "Offer.pdf", content: Buffer.from("%PDF") }],
    });
    expect(sentBody().attachments).toEqual([
      {
        name: "Offer.pdf",
        content: Buffer.from("%PDF").toString("base64"),
        mime_type: "application/pdf",
      },
    ]);
  });

  it("throws ZeptoMail's error message on failure", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "TM_4001",
            details: [{ message: "Invalid API Token found" }],
          },
        }),
        { status: 401 },
      ),
    );
    await expect(
      sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" }),
    ).rejects.toThrow("Email send failed: Invalid API Token found");
  });

  it("sends from, cc and reply-to in ZeptoMail's shapes", async () => {
    await sendEmail({ kind: "letter",
      to: "sales@vendor.example",
      subject: "Device request",
      html: "<p>Hi</p>",
      from: "Madarth <noreply@madarth.com>",
      cc: ["admin@madarth.com", "hr@madarth.com"],
      replyTo: "Madarth Admin <admin@madarth.com>",
    });
    expect(sentBody()).toEqual({
      from: { address: "noreply@madarth.com", name: "Madarth" },
      to: [{ email_address: { address: "sales@vendor.example" } }],
      cc: [
        { email_address: { address: "admin@madarth.com" } },
        { email_address: { address: "hr@madarth.com" } },
      ],
      // reply_to is flat, not wrapped in email_address.
      reply_to: [{ address: "admin@madarth.com", name: "Madarth Admin" }],
      subject: "Device request",
      htmlbody: "<p>Hi</p>",
    });
  });

  it("leaves cc and reply_to out when not given", async () => {
    await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H", cc: [] });
    expect(sentBody()).not.toHaveProperty("cc");
    expect(sentBody()).not.toHaveProperty("reply_to");
  });
});

describe("email log", () => {
  it("records a sent email with ZeptoMail's id, links removed", async () => {
    await sendEmail({
      kind: "reset",
      to: "a@x.com",
      cc: ["hr@madarth.com"],
      subject: "Reset",
      html: '<a href="https://connect.madarth.com/reset-password?token=SECRET">Reset</a>',
      sentById: "u1",
    });
    const data = db.emailLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      kind: "reset",
      from: "HCM <noreply@madarth.com>",
      to: ["a@x.com"],
      cc: ["hr@madarth.com"],
      status: "SENT",
      provider: "zeptomail",
      providerId: "r1",
      resendable: false,
      sentById: "u1",
    });
    expect(data.html).not.toContain("SECRET");
  });

  it("records a failure and still throws", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Bad" } }), { status: 400 }));
    await expect(sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" })).rejects.toThrow("Bad");
    expect(db.emailLog.create.mock.calls[0][0].data).toMatchObject({ status: "FAILED", error: "Email send failed: Bad", resendable: true });
  });

  it("records not-sent when email isn't set up", async () => {
    delete process.env.ZEPTOMAIL_TOKEN;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" });
    expect(db.emailLog.create.mock.calls[0][0].data.status).toBe("NOT_SENT");
  });

  it("a logging failure doesn't break sending", async () => {
    db.emailLog.create.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" })).toEqual({ skipped: false, id: "r1" });
  });
});

describe("sendEmail (SMTP)", () => {
  beforeEach(() => {
    settings({ emailTransport: { transport: "smtp" }, emailSmtp: SMTP });
  });

  it("sends through the saved server over SSL with the decrypted password", async () => {
    const result = await sendEmail({
      kind: "device-request",
      from: "Madarth <noreply@madarth.com>",
      to: "vendor@x.com",
      cc: ["hr@madarth.com"],
      replyTo: "Ops <ops@madarth.com>",
      subject: "Laptop",
      html: "<p>Hi</p>",
      attachments: [{ filename: "quote.pdf", content: Buffer.from("pdf") }],
    });
    expect(result).toEqual({ skipped: false, id: "<m1@madarth.com>", from: "Madarth <noreply@madarth.com>" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(decryptField).toHaveBeenCalledWith("k1:enc");
    expect(smtp.createTransport).toHaveBeenCalledWith({
      host: "smtp.zoho.com",
      port: 465,
      secure: true,
      auth: { user: "noreply@madarth.com", pass: "app-pass" },
    });
    expect(smtp.sendMail).toHaveBeenCalledWith({
      from: "Madarth <noreply@madarth.com>",
      to: ["vendor@x.com"],
      cc: ["hr@madarth.com"],
      replyTo: "Ops <ops@madarth.com>",
      subject: "Laptop",
      html: "<p>Hi</p>",
      attachments: [{ filename: "quote.pdf", content: Buffer.from("pdf") }],
    });
    expect(smtp.close).toHaveBeenCalled();
    expect(db.emailLog.create.mock.calls[0][0].data).toMatchObject({
      status: "SENT",
      provider: "smtp",
      providerId: "<m1@madarth.com>",
    });
  });

  it("always sends from the saved address, keeping the email's own name", async () => {
    settings({ emailTransport: { transport: "smtp" }, emailSmtp: { ...SMTP, fromAddress: "mail@madarth.com" } });
    await sendEmail({ kind: "letter", from: "Madarth <noreply@madarth.com>", to: "a@x.com", subject: "S", html: "H" });
    expect(smtp.sendMail.mock.calls[0][0].from).toBe("Madarth <mail@madarth.com>");
    expect(db.emailLog.create.mock.calls[0][0].data.from).toBe("Madarth <mail@madarth.com>");
  });

  it("falls back to the saved name when the email has none", async () => {
    process.env.EMAIL_FROM = "noreply@madarth.com";
    settings({ emailTransport: { transport: "smtp" }, emailSmtp: { ...SMTP, fromName: "Madarth HR" } });
    await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" });
    expect(smtp.sendMail.mock.calls[0][0].from).toBe("Madarth HR <noreply@madarth.com>");
  });

  it("uses STARTTLS on port 587", async () => {
    settings({ emailTransport: { transport: "smtp" }, emailSmtp: { ...SMTP, host: "smtp.zoho.in", port: 587 } });
    await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" });
    expect(smtp.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.zoho.in", port: 587, secure: false }),
    );
  });

  it("leaves cc, reply-to and attachments out when not given", async () => {
    await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H", cc: [] });
    const message = smtp.sendMail.mock.calls[0][0];
    expect(message).not.toHaveProperty("cc");
    expect(message).not.toHaveProperty("replyTo");
    expect(message).not.toHaveProperty("attachments");
  });

  it("skips and logs not-sent when no SMTP details are saved", async () => {
    settings({ emailTransport: { transport: "smtp" } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const reason = "SMTP isn't set up — add the details on Admin → Email templates.";
    expect(await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" })).toEqual({ skipped: true, reason });
    expect(smtp.createTransport).not.toHaveBeenCalled();
    expect(db.emailLog.create.mock.calls[0][0].data).toMatchObject({ status: "NOT_SENT", provider: "smtp", error: reason });
  });

  it("fails clearly when the saved password can't be decrypted", async () => {
    decryptField.mockImplementation(() => {
      throw new Error("bad tag");
    });
    await expect(sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" })).rejects.toThrow("enter it again");
    expect(smtp.createTransport).not.toHaveBeenCalled();
    expect(db.emailLog.create.mock.calls[0][0].data).toMatchObject({ status: "FAILED", provider: "smtp" });
  });

  it("logs a failure with the server's message and still throws", async () => {
    smtp.sendMail.mockRejectedValue(new Error("553 Relaying disallowed"));
    await expect(sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" })).rejects.toThrow(
      "Email send failed: 553 Relaying disallowed",
    );
    expect(smtp.close).toHaveBeenCalled();
    expect(db.emailLog.create.mock.calls[0][0].data).toMatchObject({
      status: "FAILED",
      provider: "smtp",
      error: "Email send failed: 553 Relaying disallowed",
    });
  });
});

describe("per-email routing", () => {
  it("doesn't send an email that's turned off, and logs why", async () => {
    settings({ emailRouting: { "probation-digest": "off" } });
    expect(await sendEmail({ kind: "probation-digest", to: "hr@madarth.com", subject: "S", html: "H" })).toEqual({
      skipped: true,
      reason: TURNED_OFF_REASON,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(smtp.createTransport).not.toHaveBeenCalled();
    expect(db.emailLog.create.mock.calls[0][0].data).toMatchObject({
      kind: "probation-digest",
      status: "NOT_SENT",
      provider: "off",
      error: TURNED_OFF_REASON,
    });
  });

  it("sends one email through SMTP while the default stays ZeptoMail", async () => {
    settings({ emailRouting: { "device-request": "smtp" }, emailSmtp: SMTP });
    await sendEmail({ kind: "device-request", to: "v@x.com", subject: "S", html: "H" });
    expect(smtp.sendMail).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(smtp.sendMail).toHaveBeenCalledTimes(1);
  });

  it("routes letters by their own template, not the shared kind", async () => {
    settings({ emailRouting: { "letter-offer": "off", letter: "smtp" }, emailSmtp: SMTP });
    const result = await sendEmail({ kind: "letter", template: "letter-offer", to: "a@x.com", subject: "S", html: "H" });
    expect(result).toEqual({ skipped: true, reason: TURNED_OFF_REASON });
    await sendEmail({ kind: "letter", template: "letter-intern", to: "a@x.com", subject: "S", html: "H" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an override can send through ZeptoMail while the default is SMTP", async () => {
    settings({ emailTransport: { transport: "smtp" }, emailSmtp: SMTP, emailRouting: { reset: "zeptomail" } });
    await sendEmail({ kind: "reset", to: "a@x.com", subject: "S", html: "H" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });

  it("keeps only valid overrides", () => {
    expect(readEmailRouting({ invite: "off", reset: "smtp", letter: "zeptomail", junk: "gmail", other: 3 })).toEqual({
      invite: "off",
      reset: "smtp",
      letter: "zeptomail",
    });
    expect(readEmailRouting(null)).toEqual({});
    expect(readEmailRouting(["off"])).toEqual({});
  });
});

describe("signature", () => {
  const SLOT = "<p>Body</p><!--hcm:signature-->";

  it("signs the email before sending, and the log keeps the signed copy", async () => {
    vi.stubEnv("AUTH_URL", "https://connect.madarth.com");
    await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: SLOT });
    expect(sentBody().htmlbody).toContain("Madarth&#39;s System Email");
    expect(sentBody().htmlbody).toContain("https://connect.madarth.com/email/madarth-logo.png");
    expect(sentBody().htmlbody).not.toContain("<!--hcm:signature-->");
    expect(db.emailLog.create.mock.calls[0][0].data.html).toContain("Madarth&#39;s System Email");
    vi.unstubAllEnvs();
  });

  it("uses the saved signature, and drops it when turned off", async () => {
    settings({ emailSignature: { name: "Asha Rao" } });
    await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: SLOT });
    expect(sentBody().htmlbody).toContain("Asha Rao");
    fetchMock.mockClear();
    settings({ emailSignature: { enabled: false } });
    await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: SLOT });
    expect(sentBody().htmlbody).toBe("<p>Body</p>");
  });

  it("leaves email without a slot (a stored resend) as it is", async () => {
    await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "<p>Already signed</p>" });
    expect(sentBody().htmlbody).toBe("<p>Already signed</p>");
  });
});

describe("settings", () => {
  it("defaults to ZeptoMail for a missing or unknown transport", () => {
    expect(readEmailTransport(undefined)).toBe("zeptomail");
    expect(readEmailTransport({ transport: "gmail" })).toBe("zeptomail");
    expect(readEmailTransport("smtp")).toBe("zeptomail");
    expect(readEmailTransport({ transport: "smtp" })).toBe("smtp");
  });

  it("treats incomplete SMTP details as not set up", () => {
    expect(readSmtpSettings(SMTP)).toEqual(SMTP);
    expect(readSmtpSettings(null)).toBeNull();
    expect(readSmtpSettings({ ...SMTP, passwordEncrypted: "" })).toBeNull();
    expect(readSmtpSettings({ ...SMTP, port: 70000 })).toBeNull();
    expect(readSmtpSettings({ ...SMTP, fromName: undefined })).toEqual({ ...SMTP, fromName: "" });
  });

  it("reports which services are set up without exposing values", async () => {
    delete process.env.ZEPTOMAIL_TOKEN;
    settings({ emailTransport: { transport: "smtp" }, emailSmtp: SMTP });
    expect(await emailTransportStatus()).toEqual({ transport: "smtp", configured: { zeptomail: false, smtp: true } });
  });
});
