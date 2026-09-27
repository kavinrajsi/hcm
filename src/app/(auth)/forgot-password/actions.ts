"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { createPasswordLink, RESET_TTL_MS } from "@/lib/password-links";

export type ForgotFormState = { error?: string; ok?: boolean };

const emailSchema = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email")),
});

export async function requestPasswordReset(
  _prev: ForgotFormState,
  formData: FormData,
): Promise<ForgotFormState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email" };
  }
  const email = parsed.data.email.toLowerCase();

  const user = await db.user.findUnique({ where: { email } });
  // Same response whether or not the account exists — no enumeration.
  if (!user) return { ok: true };

  const resetUrl = await createPasswordLink(user.id, { ttlMs: RESET_TTL_MS });

  const result = await sendEmail({
    to: email,
    subject: "Reset your HRM password",
    html: `
      <p>Someone (hopefully you) requested a password reset for HRM.</p>
      <p><a href="${resetUrl}">Set a new password</a> — the link expires in 1 hour.</p>
      <p>If you didn't request this, you can ignore this email.</p>
    `,
  });
  if (result.skipped) {
    // Local/dev without RESEND_API_KEY: surface the link in server logs.
    console.log(`[password-reset] link for ${email}: ${resetUrl}`);
  }

  return { ok: true };
}
