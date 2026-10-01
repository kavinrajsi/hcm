"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import { savePurchaseEmailSettings, type SettingsState } from "../provision/actions";

export function PurchaseEmailSettingsForm({ replyTo, cc }: { replyTo: string; cc: string[] }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(savePurchaseEmailSettings, {});
  return (
    <ValidatedForm action={formAction} fieldErrors={state.fieldErrors} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">From</span>
        <Input value="Madarth <noreply@madarth.com>" disabled readOnly />
        <span className="text-xs text-zinc-500">Fixed: the address the mail service is set up to send from.</span>
      </label>
      <FormField name="replyTo" label="Reply to" hint="Vendor replies go here.">
        <Input type="email" name="replyTo" required defaultValue={replyTo} />
      </FormField>
      <FormField name="cc" label="CC" hint="One address per line (commas work too). Add or remove anyone any time.">
        <Textarea name="cc" rows={4} defaultValue={cc.join("\n")} />
      </FormField>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <FormMessage error={state.error} ok={state.ok} />
      </div>
    </ValidatedForm>
  );
}
