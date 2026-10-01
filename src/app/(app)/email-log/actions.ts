"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendEmail } from "@/lib/email";
import { isEmailKind } from "@/lib/email-log";
import type { FormState } from "@/lib/form-state";

/** Re-sends a failed email exactly as stored; logged as a new row. */
export async function resendEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("HR_ADMIN");
  const id = String(formData.get("id") ?? "");
  const row = await db.emailLog.findUnique({ where: { id } });
  if (!row) return { error: "Email not found." };
  if (row.status === "SENT") return { error: "This email was sent already." };
  if (!row.resendable || !isEmailKind(row.kind))
    return { error: "This email can't be resent (it had a one-time link or an attachment). Send it again from its page." };
  let failed: string | undefined;
  try {
    await sendEmail({
      kind: row.kind,
      from: row.from,
      to: row.to,
      cc: row.cc,
      replyTo: row.replyTo ?? undefined,
      subject: row.subject,
      html: row.html,
      employeeId: row.employeeId,
      sentById: user.id,
      resendOfId: row.id,
    });
  } catch (error) {
    failed = error instanceof Error ? error.message : "Send failed";
  }
  const latest = await db.emailLog.findFirst({
    where: { resendOfId: row.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  revalidatePath("/email-log");
  if (latest) redirect(`/email-log/${latest.id}`);
  return { error: failed ?? "Resent, but the log entry is missing." };
}

/** HR: the ZeptoMail webhook URL with its key, fetched only on "Show". */
export async function revealWebhookUrl(): Promise<{ url?: string; error?: string }> {
  await requireRole("HR_ADMIN");
  const secret = process.env.ZEPTOMAIL_WEBHOOK_SECRET?.trim();
  if (!secret) return { error: "ZEPTOMAIL_WEBHOOK_SECRET isn't set on the server yet." };
  const base = (process.env.AUTH_URL || "https://connect.madarth.com").replace(/\/$/, "");
  return { url: `${base}/api/webhooks/zeptomail?key=${encodeURIComponent(secret)}` };
}
