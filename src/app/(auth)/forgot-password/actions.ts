"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { invalid, type FormState } from "@/lib/form-state";
import { mailPasswordLink } from "@/lib/logins";
import { createPasswordLink, RESET_TTL_MS } from "@/lib/password-links";
import {
  clientIp,
  isThrottled,
  recordAttempt,
  resetLimits,
} from "@/lib/auth-throttle";

export type ForgotFormState = FormState;

const emailSchema = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email")),
});

export async function requestPasswordReset(
  _prev: ForgotFormState,
  formData: FormData,
): Promise<ForgotFormState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return invalid(parsed.error);
  const email = parsed.data.email.toLowerCase();

  // Same response whether the account exists, or the request is throttled —
  // no enumeration. Counted before the lookup so unknown emails count too.
  const limits = resetLimits(email, clientIp(await headers()));
  if (await isThrottled(limits)) return { ok: true };
  await recordAttempt(limits);

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { ok: true };

  const resetUrl = await createPasswordLink(user.id, { ttlMs: RESET_TTL_MS });

  const emailed = await mailPasswordLink({
    to: email,
    link: resetUrl,
    invite: false,
  });
  if (!emailed) {
    // Never log the link itself: it's a working credential, and even local
    // dev points at the production database. Only local dev without a mail
    // token prints it, so the flow can be tried without email.
    if (
      process.env.NODE_ENV === "development" &&
      !process.env.ZEPTOMAIL_TOKEN
    ) {
      console.log(`[password-reset] link for ${email}: ${resetUrl}`);
    } else {
      console.error(`[password-reset] email failed for user ${user.id}`);
    }
  }

  return { ok: true };
}
