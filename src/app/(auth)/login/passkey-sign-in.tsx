"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { passkeyOptions, passkeySignIn } from "./actions";

/** "Sign in with a passkey" — hidden on browsers without WebAuthn. */
export function PasskeySignIn({ callbackUrl }: { callbackUrl: string }) {
  // False on the server, the real answer once hydrated.
  const supported = useSyncExternalStore(
    () => () => {},
    browserSupportsWebAuthn,
    () => false,
  );
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!supported) return null;

  function signInWithPasskey() {
    setError(undefined);
    startTransition(async () => {
      const options = await passkeyOptions();
      if (!options) {
        setError("Too many attempts. Wait 15 minutes, or sign in with your password.");
        return;
      }
      let response;
      try {
        response = await startAuthentication(options);
      } catch {
        // Cancelled, timed out, or no passkey for HCM on this device.
        setError("No passkey was used. Try again, or sign in with your password.");
        return;
      }
      await passkeySignIn(JSON.stringify(response), callbackUrl);
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-2">
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <button
        type="button"
        onClick={signInWithPasskey}
        disabled={pending}
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {pending ? "Waiting for your passkey…" : "Sign in with a passkey"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
