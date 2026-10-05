"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, TooManyAttempts } from "@/lib/auth";
import { authenticationOptions } from "@/lib/passkeys";
import { clientIp, isThrottled, passkeyOptionLimits, recordAttempt } from "@/lib/auth-throttle";
import { safeCallbackPath } from "@/lib/safe-redirect";

/**
 * Step 1 of passkey sign-in: a fresh challenge for the browser to sign.
 * Open to signed-out visitors, so throttled per IP; null when throttled.
 */
export async function passkeyOptions() {
  const limits = passkeyOptionLimits(clientIp(await headers()));
  if (await isThrottled(limits)) return null;
  await recordAttempt(limits);
  return authenticationOptions();
}

/** Step 2: hand the signed challenge to the "passkey" provider. */
export async function passkeySignIn(response: string, callbackUrl: string) {
  const back = safeCallbackPath(callbackUrl);
  try {
    await signIn("passkey", { response, redirectTo: back });
  } catch (error) {
    if (error instanceof AuthError) {
      const reason = error instanceof TooManyAttempts ? "throttled" : "passkey";
      redirect(
        `/login?error=${reason}${back !== "/" ? `&callbackUrl=${encodeURIComponent(back)}` : ""}`,
      );
    }
    throw error;
  }
}
