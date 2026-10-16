"use client";

// Admin → Email templates: the sign-off every email ends with, with a live
// preview. Submitted by hand so React doesn't reset the fields (and the
// preview) after saving.

import { startTransition, useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import type { FormState } from "@/lib/form-state";
import { DEFAULT_LOGO_PATH, signatureHtml, type EmailSignature } from "@/lib/email-signature-html";
import { saveSignature } from "./actions";

export function SignatureForm({ saved, savedLogoSrc }: { saved: EmailSignature; savedLogoSrc: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveSignature, {});
  const [signature, setSignature] = useState(saved);
  const [useDefaultLogo, setUseDefaultLogo] = useState(false);
  const [pickedLogo, setPickedLogo] = useState<string | null>(null);
  useEffect(() => () => {
    if (pickedLogo) URL.revokeObjectURL(pickedLogo);
  }, [pickedLogo]);

  const logoSrc = pickedLogo ?? (useDefaultLogo ? DEFAULT_LOGO_PATH : savedLogoSrc);
  const set = (key: keyof EmailSignature) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSignature((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ValidatedForm
        fieldErrors={state.fieldErrors}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => formAction(data));
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="enabled"
            checked={signature.enabled}
            onChange={(event) => setSignature((current) => ({ ...current, enabled: event.target.checked }))}
            className="size-4 accent-primary"
          />
          Add to every email
        </label>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <FormField name="closing" label="Closing">
            <Input name="closing" value={signature.closing} onChange={set("closing")} maxLength={40} />
          </FormField>
          <FormField name="name" label="Name">
            <Input name="name" value={signature.name} onChange={set("name")} maxLength={80} />
          </FormField>
        </div>
        <FormField name="website" label="Website">
          <Input name="website" value={signature.website} onChange={set("website")} maxLength={100} />
        </FormField>
        <FormField name="address" label="Address" hint="Line breaks show as typed.">
          <Textarea name="address" rows={3} value={signature.address} onChange={set("address")} maxLength={200} />
        </FormField>
        <FormField name="logo" label="Logo" hint="PNG or JPG, under 300 KB. Shown at 175 × 30; upload it at twice that size for sharp screens.">
          <Input
            name="logo"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setPickedLogo(file ? URL.createObjectURL(file) : null);
            }}
          />
        </FormField>
        {saved.logoPathname && !pickedLogo && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="defaultLogo"
              checked={useDefaultLogo}
              onChange={(event) => setUseDefaultLogo(event.target.checked)}
              className="size-4 accent-primary"
            />
            Use the default Madarth logo instead
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save signature"}
          </Button>
          <FormMessage error={state.error} ok={state.ok} />
        </div>
      </ValidatedForm>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Preview</span>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800">
          {signature.enabled ? (
            <div
              // Our own escaped template (signatureHtml), as emails get it.
              dangerouslySetInnerHTML={{ __html: signatureHtml(signature, { logoSrc }) }}
            />
          ) : (
            <p className="text-sm text-zinc-500">Emails go out without a signature.</p>
          )}
        </div>
      </div>
    </div>
  );
}
