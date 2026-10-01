"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailEditor } from "@/components/email-editor";
import { ValidatedForm } from "@/components/form/validated-form";
import {
  FieldError,
  FormField,
  FormMessage,
} from "@/components/form/form-field";
import {
  resetLetterTemplate,
  saveLetterTemplate,
  type TemplateFormState,
} from "./actions";

/** One starting template (Offer / Intern / Compensation), HR-editable. */
export function TemplateEditor({
  type,
  label,
  subject: initialSubject,
  body,
  custom,
  editedNote,
}: {
  type: string;
  label: string;
  subject: string;
  body: string;
  custom: boolean;
  editedNote: string | null;
}) {
  const [state, action, pending] = useActionState<TemplateFormState, FormData>(
    saveLetterTemplate,
    {},
  );
  const [subject, setSubject] = useState(initialSubject);
  const id = `tpl-${type.toLowerCase()}`;

  return (
    <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{label}</h3>
        <span className="text-xs text-zinc-500">
          {custom ? (editedNote ?? "Customised") : "Default template"}
        </span>
      </div>
      <ValidatedForm
        action={action}
        fieldErrors={state.fieldErrors}
        className="mt-3 flex flex-col gap-3"
      >
        <input type="hidden" name="type" value={type} />
        <FormField label="Subject" name="subject">
          <Input
            id={`${id}-subject`}
            name="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={200}
            required
          />
        </FormField>
        <div className="flex flex-col gap-1">
          <EmailEditor
            name="body"
            defaultValue={body}
            subject={subject}
            placeholders
            label={`${label} body`}
          />
          <FieldError name="body" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save template"}
          </Button>
          {custom && (
            // Posts the separate reset form below, so the subject/body
            // checks (and the editor's unsaved text) don't get in the way.
            <Button type="submit" variant="outline" form={`${id}-reset`}>
              Reset to default
            </Button>
          )}
          {state.ok && !state.error && (
            <p className="text-sm text-green-600">Saved.</p>
          )}
          <FormMessage error={state.error} />
        </div>
      </ValidatedForm>
      {custom && (
        <form id={`${id}-reset`} action={resetLetterTemplate} hidden>
          <input type="hidden" name="type" value={type} />
        </form>
      )}
    </section>
  );
}
