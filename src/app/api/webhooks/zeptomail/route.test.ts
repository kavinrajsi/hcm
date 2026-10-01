import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const applyWebhook = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email-log", () => ({ applyWebhook }));

const { POST, signatureOk } = await import("./route");
const body = JSON.stringify({ event_name: "email opens", request_id: "r1" });
const sign = (payload: string, ts = Date.now()) =>
  `ts=${ts};s=${encodeURIComponent(createHmac("sha256", "whsecret").update(payload).digest("base64"))};s-algorithm=HmacSHA256`;
const post = (url: string, headers: Record<string, string> = {}) =>
  POST(new Request(url, { method: "POST", body, headers }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ZEPTOMAIL_WEBHOOK_SECRET = "whsecret";
  applyWebhook.mockResolvedValue(true);
});

describe("ZeptoMail webhook", () => {
  it("accepts ZeptoMail's signature", async () => {
    const response = await post("https://h/api/webhooks/zeptomail", { "producer-signature": sign(body) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, matched: 1 });
  });

  it("accepts the key in the URL", async () => {
    expect((await post("https://h/api/webhooks/zeptomail?key=whsecret")).status).toBe(200);
  });

  it("rejects a wrong key, a bad or stale signature", async () => {
    expect((await post("https://h/api/webhooks/zeptomail?key=nope")).status).toBe(401);
    expect((await post("https://h/api/webhooks/zeptomail", { "producer-signature": sign("other") })).status).toBe(401);
    expect(signatureOk(sign(body, Date.now() - 2 * 3_600_000), body, "whsecret")).toBe(false);
    expect(applyWebhook).not.toHaveBeenCalled();
  });

  it("is off until the secret is set", async () => {
    delete process.env.ZEPTOMAIL_WEBHOOK_SECRET;
    expect((await post("https://h/api/webhooks/zeptomail?key=whsecret")).status).toBe(503);
  });
});
