"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type ForgotFormState } from "./actions";

export function ForgotForm() {
  const [state, formAction, pending] = useActionState<
    ForgotFormState,
    FormData
  >(requestPasswordReset, {});

  if (state.ok) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        If an account exists for that email, a reset link is on its way.
        Check your inbox — the link expires in 1 hour.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
