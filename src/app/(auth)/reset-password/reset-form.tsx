"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import { resetPassword, type ResetFormState } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ResetFormState, FormData>(
    resetPassword,
    {},
  );

  if (state.ok) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Password updated.{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>{" "}
        with your new password.
      </p>
    );
  }

  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="token" value={token} />
      <FormField name="newPassword" label="New password" className="gap-1.5">
        <Input
          id="reset-new"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </FormField>
      <FormField name="confirmPassword" label="Confirm new password" className="gap-1.5">
        <Input
          id="reset-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </FormField>
      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </ValidatedForm>
  );
}
