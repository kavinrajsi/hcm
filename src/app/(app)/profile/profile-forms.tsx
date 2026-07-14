"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <form action={formAction} className="flex flex-col gap-3 sm:max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Display name</Label>
        <Input id="profile-name" name="name" defaultValue={defaultName} required />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
        {state.ok && <p className="text-sm text-green-600">Saved.</p>}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction, pending] = useActionState<
    ProfileFormState,
    FormData
  >(changePassword, {});

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:max-w-sm">
      {hasPassword && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-current">Current password</Label>
          <Input
            id="profile-current"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-new">New password</Label>
        <Input
          id="profile-new"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-confirm">Confirm new password</Label>
        <Input
          id="profile-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : hasPassword
              ? "Change password"
              : "Set password"}
        </Button>
        {state.ok && <p className="text-sm text-green-600">Password updated.</p>}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
