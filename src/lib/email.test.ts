import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(await sendEmail({ to: "a@x.com", subject: "S", html: "H" })).toEqual(
      { skipped: true },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts ZeptoMail's message format with the token header", async () => {
    const result = await sendEmail({
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
    await sendEmail({ to: "a@x.com", subject: "S", html: "H" });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Zoho-enczapikey abc123",
    );
  });

  it("uses ZEPTOMAIL_API_URL when set", async () => {
    process.env.ZEPTOMAIL_API_URL = "https://api.zeptomail.in/v1.1/email";
    await sendEmail({ to: "a@x.com", subject: "S", html: "H" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.zeptomail.in/v1.1/email",
    );
  });

  it("sends attachments as base64 with a mime type", async () => {
    await sendEmail({
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
      sendEmail({ to: "a@x.com", subject: "S", html: "H" }),
    ).rejects.toThrow("Email send failed: Invalid API Token found");
  });
});
