"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { mailPasswordLink } from "@/lib/logins";
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

  const emailed = await mailPasswordLink({
    to: email,
    link: resetUrl,
    invite: false,
  });
  if (!emailed) {
    // Local/dev without ZEPTOMAIL_TOKEN (or a send error): surface the link
    // in server logs.
    console.log(`[password-reset] link for ${email}: ${resetUrl}`);
  }

  return { ok: true };
}
