"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import {
  changePassword,
  updateAccountName,
  type ProfileFormState,
} from "./actions";

export function NameForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState<
    ProfileFormState,
    FormData
  >(updateAccountName, {});

  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-3 sm:max-w-sm"
    >
      <FormField name="name" label="Display name" className="gap-1.5">
        <Input id="profile-name" name="name" defaultValue={defaultName} required />
      </FormField>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
        {state.ok && <p className="text-sm text-green-600">Saved.</p>}
        <FormMessage error={state.error} />
      </div>
    </ValidatedForm>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction, pending] = useActionState<
    ProfileFormState,
    FormData
  >(changePassword, {});

  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-3 sm:max-w-sm"
    >
      {hasPassword && (
        <FormField name="currentPassword" label="Current password" className="gap-1.5">
          <Input
            id="profile-current"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </FormField>
      )}
      <FormField name="newPassword" label="New password" className="gap-1.5">
        <Input
          id="profile-new"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </FormField>
      <FormField name="confirmPassword" label="Confirm new password" className="gap-1.5">
        <Input
          id="profile-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </FormField>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : hasPassword
              ? "Change password"
              : "Set password"}
        </Button>
        {state.ok && <p className="text-sm text-green-600">Password updated.</p>}
        <FormMessage error={state.error} />
      </div>
    </ValidatedForm>
  );
}
