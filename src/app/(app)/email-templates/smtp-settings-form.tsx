"use client";

// Admin → Email templates: the SMTP server HCM uses when "SMTP" is the
// sending service. The saved password is never shown; leave it blank to
// keep it.

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import type { FormState } from "@/lib/form-state";
import { removeSmtpSettings, saveSmtpSettings } from "./actions";

export type SmtpFormValues = {
  host: string;
  port: number;
  username: string;
  fromAddress: string;
  fromName: string;
  hasPassword: boolean;
};

export function SmtpSettingsForm({ saved }: { saved: SmtpFormValues | null }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveSmtpSettings, {});
  const [removeState, removeAction, removing] = useActionState<FormState, FormData>(() => removeSmtpSettings(), {});
  return (
    <div className="flex flex-col gap-4">
      <ValidatedForm action={formAction} fieldErrors={state.fieldErrors} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <FormField name="host" label="SMTP server">
            <Input name="host" required placeholder="smtppro.zoho.com" defaultValue={saved?.host ?? "smtppro.zoho.com"} autoComplete="off" />
          </FormField>
          <FormField name="port" label="Port" hint="465 = SSL (Zoho), 587 = STARTTLS">
            <Input name="port" type="number" min={1} max={65535} required defaultValue={saved?.port ?? 465} />
          </FormField>
        </div>
        <FormField name="username" label="Username" hint="Usually the mailbox address, e.g. noreply@madarth.com.">
          <Input name="username" required defaultValue={saved?.username ?? ""} autoComplete="off" />
        </FormField>
        <FormField
          name="password"
          label="Password"
          hint={
            saved?.hasPassword
              ? "Saved. Leave blank to keep it."
              : "For Zoho Mail, create an app-specific password in your Zoho account's security settings."
          }
        >
          <Input
            name="password"
            type="password"
            required={!saved?.hasPassword}
            placeholder={saved?.hasPassword ? "••••••••" : ""}
            autoComplete="new-password"
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="fromAddress" label="From address" hint="Must be the mailbox or one of its aliases.">
            <Input name="fromAddress" type="email" required defaultValue={saved?.fromAddress ?? ""} />
          </FormField>
          <FormField name="fromName" label="From name" hint="Used when an email doesn't set its own, e.g. HCM.">
            <Input name="fromName" maxLength={60} defaultValue={saved?.fromName ?? "HCM"} />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save SMTP details"}
          </Button>
          <FormMessage error={state.error} ok={state.ok} />
        </div>
      </ValidatedForm>
      {saved && (
        <form
          action={removeAction}
          onSubmit={(event) => {
            if (!window.confirm("Remove the saved SMTP details?")) event.preventDefault();
          }}
          className="flex flex-wrap items-center gap-3"
        >
          <Button type="submit" variant="ghost" disabled={removing}>
            {removing ? "Removing…" : "Remove SMTP details"}
          </Button>
          <FormMessage error={removeState.error} ok={removeState.ok} />
        </form>
      )}
    </div>
  );
}
