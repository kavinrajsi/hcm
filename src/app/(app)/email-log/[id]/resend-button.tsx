"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/form/form-field";
import { resendEmail } from "../actions";

export function ResendButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(resendEmail, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Resend"}
      </Button>
      <FormMessage error={state.error} />
      <p className="w-full text-xs text-zinc-500">
        Goes through the service set for this email on Email templates (letters use the default).
      </p>
    </form>
  );
}
