"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { beginPasskeyRegistration, finishPasskeyRegistration } from "./actions";

/** Name this device's passkey, then let the browser create it. */
export function AddPasskey() {
  const supported = useSyncExternalStore(
    () => () => {},
    browserSupportsWebAuthn,
    () => false,
  );
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  if (!supported) {
    return (
      <p className="mt-3 text-sm text-zinc-500">
        This browser can&apos;t create passkeys.
      </p>
    );
  }

  function addPasskey() {
    setMessage(undefined);
    startTransition(async () => {
      let response;
      try {
        response = await startRegistration(await beginPasskeyRegistration());
      } catch (error) {
        const duplicate = error instanceof Error && error.name === "InvalidStateError";
        setMessage({
          ok: false,
          text: duplicate
            ? "This device already has a passkey for HCM."
            : "No passkey was created.",
        });
        return;
      }
      const result = await finishPasskeyRegistration(response, name);
      if (result.ok) {
        setName("");
        setMessage({ ok: true, text: "Passkey added. You can use it next time you sign in." });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Passkey name"
          placeholder="Name, e.g. Work laptop"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          className="max-w-xs"
        />
        <Button type="button" onClick={addPasskey} disabled={pending}>
          {pending ? "Waiting for your device…" : "Add a passkey"}
        </Button>
      </div>
      {message ? (
        <p
          role="status"
          className={`text-sm ${message.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
