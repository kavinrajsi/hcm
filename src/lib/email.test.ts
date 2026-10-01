import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ emailLog: { create: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

import { parseSender, sendEmail } from "./email";

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
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  db.emailLog.create.mockReset();
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
    expect(await sendEmail({ kind: "letter", to: "a@x.com", subject: "S", html: "H" })).toEqual(
      { skipped: true },
    );
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
