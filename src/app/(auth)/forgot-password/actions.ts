"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export type ForgotFormState = { error?: string; ok?: boolean };

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

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

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await db.$transaction([
    // A new request supersedes any outstanding links.
    db.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    }),
    db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);

  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    process.env.AUTH_URL ??
    "http://localhost:3000";
  const resetUrl = `${origin}/reset-password?token=${rawToken}`;

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
