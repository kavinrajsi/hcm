import type { EmailDelivery, EmailStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { SendEmailOptions } from "@/lib/email";

// Admin → Email log: one row per email HCM tries to send. Content is kept
// with password / invite links removed. Delivery (opens, bounces) arrives
// from ZeptoMail webhooks.

export const EMAIL_KINDS = {
  invite: "Account invite",
  reset: "Password reset",
  "type-change": "Employment type changed",
  "exit-clearance": "Exit clearance",
  "probation-digest": "Probation confirmations overdue",
  "ending-soon": "Ending within a week",
  letter: "Letter",
  "device-request": "Device request to vendor",
} as const;
export type EmailKind = keyof typeof EMAIL_KINDS;

export const isEmailKind = (value: unknown): value is EmailKind =>
  typeof value === "string" && value in EMAIL_KINDS;

/** Links carrying one-time tokens, which must never sit in the log. */
const SECRET_LINK = /https?:\/\/[^\s"'<>]*[?&](?:token|code|key)=[^\s"'<>]*/gi;
export const REMOVED_LINK = "#link-removed";

export function redactEmailHtml(html: string): string {
  return html.replace(SECRET_LINK, REMOVED_LINK);
}

/** Expiring links (redacted) and stored-nowhere attachments can't be resent. */
export function isResendable(kind: EmailKind, html: string, attachments: number): boolean {
  if (kind === "invite" || kind === "reset" || attachments > 0) return false;
  return redactEmailHtml(html) === html;
}

const list = (to: string | string[]) => (Array.isArray(to) ? to : [to]);

/** Records one send attempt. Never throws: logging mustn't break email. */
export async function logEmail(
  options: SendEmailOptions,
  outcome: { status: EmailStatus; error?: string; providerId?: string },
): Promise<void> {
  try {
    const { senderOf } = await import("@/lib/email");
    await db.emailLog.create({
      data: {
        kind: options.kind,
        from: senderOf(options),
        to: list(options.to),
        cc: options.cc ?? [],
        replyTo: options.replyTo ?? null,
        subject: options.subject,
        html: redactEmailHtml(options.html),
        attachmentNames: (options.attachments ?? []).map((attachment) => attachment.filename),
        status: outcome.status,
        error: outcome.error ?? null,
        providerId: outcome.providerId ?? null,
        resendable: isResendable(options.kind, options.html, options.attachments?.length ?? 0),
        employeeId: options.employeeId ?? null,
        sentById: options.sentById ?? null,
        resendOfId: options.resendOfId ?? null,
      },
    });
  } catch (error) {
    console.error("[email-log] couldn't record email", options.kind, error);
  }
}

// --- ZeptoMail webhooks ---

export type WebhookEvent = { type: string; at: string; detail?: string };

/** ZeptoMail event_name → what the log shows. Others are kept as events only. */
export function deliveryFor(eventName: string): EmailDelivery | null {
  const name = eventName.toLowerCase().replace(/[\s_-]/g, "");
  if (name.includes("bounce")) return "BOUNCED";
  if (name.includes("open") || name.includes("click")) return "OPENED";
  if (name.includes("deliver")) return "DELIVERED";
  return null;
}

// Bounce beats open beats delivered: a later open doesn't hide a bounce.
const RANK: Record<EmailDelivery, number> = { DELIVERED: 1, OPENED: 2, BOUNCED: 3 };

/** Depth-first search for a field anywhere in the payload. */
function findField(value: unknown, key: string, depth = 0): unknown {
  if (!value || typeof value !== "object" || depth > 6) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findField(item, key, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (key in record && record[key] != null) return record[key];
  for (const child of Object.values(record)) {
    const found = findField(child, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Applies one ZeptoMail webhook payload to its log row (matched by
 * request_id). Returns false when it doesn't match any email.
 */
export async function applyWebhook(payload: unknown): Promise<boolean> {
  const eventName = String(findField(payload, "event_name") ?? "");
  const requestId = findField(payload, "request_id");
  if (!eventName || typeof requestId !== "string") return false;
  const row = await db.emailLog.findFirst({
    where: { providerId: requestId },
    select: { id: true, delivery: true, events: true },
  });
  if (!row) return false;
  const reason = findField(payload, "reason") ?? findField(payload, "diagnostic_message");
  const event: WebhookEvent = {
    type: eventName,
    at: new Date().toISOString(),
    ...(typeof reason === "string" ? { detail: reason.slice(0, 500) } : {}),
  };
  const next = deliveryFor(eventName);
  const upgrade = next && (!row.delivery || RANK[next] >= RANK[row.delivery]);
  const events = (Array.isArray(row.events) ? row.events : []) as Prisma.JsonArray;
  await db.emailLog.update({
    where: { id: row.id },
    data: {
      events: [...events, event].slice(-50),
      ...(upgrade ? { delivery: next, deliveryAt: new Date() } : {}),
    },
  });
  return true;
}
