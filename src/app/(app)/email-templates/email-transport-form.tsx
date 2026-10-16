"use client";

// Admin → Email templates: pick ZeptoMail or SMTP, and send a test.

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ValidatedForm } from "@/components/form/validated-form";
import { FieldError, FormMessage } from "@/components/form/form-field";
import type { FormState } from "@/lib/form-state";
import type { EmailTransport } from "@/lib/email";
import { saveEmailTransport, sendTestEmail } from "./actions";

const OPTIONS: { value: EmailTransport; name: string; detail: string }[] = [
  {
    value: "zeptomail",
    name: "ZeptoMail (Zoho)",
    detail: "The default. Tracks opens and bounces in the Email log.",
  },
  {
    value: "smtp",
    name: "SMTP",
    detail: "Sends through a mailbox, e.g. Zoho Mail (smtppro.zoho.com, port 465, SSL). Use if ZeptoMail is out of credit or down. Mailbox sending limits apply; no open or bounce tracking.",
  },
];

export function EmailTransportForm({
  transport,
  configured,
}: {
  transport: EmailTransport;
  configured: Record<EmailTransport, boolean>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveEmailTransport, {});
  // React resets the form after every submit, back to defaultChecked; track
  // the pick so a refused save doesn't jump back to the saved service.
  const [selected, setSelected] = useState(transport);
  const [testState, testAction, testing] = useActionState<FormState, FormData>(() => sendTestEmail(), {});
  return (
    <div className="flex flex-col gap-4">
      <ValidatedForm action={formAction} fieldErrors={state.fieldErrors} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Sending service</legend>
          {OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-4 text-sm has-checked:border-zinc-900 dark:border-zinc-800 dark:has-checked:border-zinc-200"
            >
              <input
                type="radio"
                name="transport"
                value={option.value}
                defaultChecked={selected === option.value}
                onChange={() => setSelected(option.value)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">
                  {option.name}
                  {transport === option.value && <span className="ml-2 text-xs font-normal text-zinc-500">· in use</span>}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">{option.detail}</span>
                <span className={configured[option.value] ? "text-xs text-emerald-700 dark:text-emerald-400" : "text-xs text-amber-700 dark:text-amber-400"}>
                  {configured[option.value]
                    ? "Set up"
                    : option.value === "smtp"
                      ? "Not set up yet: add the SMTP details below"
                      : "Not set up on the server yet"}
                </span>
              </span>
            </label>
          ))}
          <FieldError name="transport" />
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <FormMessage error={state.error} ok={state.ok} />
        </div>
      </ValidatedForm>
      <form action={testAction} className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={testing}>
          {testing ? "Sending…" : "Send test email to me"}
        </Button>
        <FormMessage error={testState.error} ok={testState.ok} />
      </form>
    </div>
  );
}
