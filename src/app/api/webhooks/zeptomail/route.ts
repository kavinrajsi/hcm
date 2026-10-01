import { createHmac, timingSafeEqual } from "node:crypto";
import { applyWebhook } from "@/lib/email-log";

// ZeptoMail delivery events (bounces, opens, clicks) → Admin → Email log.
// Authenticated with the Webhooks "Authentication Key" (HMAC-SHA256 in the
// producer-signature header) or, failing that, ?key= on the URL. Both use
// ZEPTOMAIL_WEBHOOK_SECRET. Unmatched events still get 200 so ZeptoMail
// doesn't keep retrying them.

const MAX_AGE_MS = 60 * 60 * 1000;

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signatureOk(header: string | null, body: string, secret: string, now = Date.now()): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(";").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    }),
  );
  const ts = Number(parts.ts);
  if (!parts.s || !Number.isFinite(ts) || Math.abs(now - ts) > MAX_AGE_MS) return false;
  let received: string;
  try {
    received = decodeURIComponent(parts.s);
  } catch {
    return false;
  }
  let decoded = body;
  try {
    decoded = decodeURIComponent(body);
  } catch {
    // Not URL-encoded: sign the body as is.
  }
  return [body, decoded].some((payload) =>
    same(createHmac("sha256", secret).update(payload).digest("base64"), received),
  );
}

export async function POST(request: Request) {
  const secret = process.env.ZEPTOMAIL_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  const body = await request.text();
  const key = new URL(request.url).searchParams.get("key");
  const authorised =
    signatureOk(request.headers.get("producer-signature"), body, secret) || (key !== null && same(key, secret));
  if (!authorised) return new Response("Unauthorized", { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    try {
      payload = JSON.parse(decodeURIComponent(body));
    } catch {
      return Response.json({ ok: true, matched: false });
    }
  }
  const events = Array.isArray(payload) ? payload : [payload];
  let matched = 0;
  for (const event of events) if (await applyWebhook(event)) matched++;
  return Response.json({ ok: true, matched });
}
