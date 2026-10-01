"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
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
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-3"
    >
      <FormField name="email" label="Email" className="gap-1.5">
        <Input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </FormField>
      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </ValidatedForm>
  );
}
