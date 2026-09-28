"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailEditor } from "@/components/email-editor";
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
      <form action={action} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="type" value={type} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-subject`} className="text-sm font-medium">
            Subject
          </label>
          <Input
            id={`${id}-subject`}
            name="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={200}
            required
          />
        </div>
        <EmailEditor
          name="body"
          defaultValue={body}
          subject={subject}
          placeholders
          label={`${label} body`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save template"}
          </Button>
          {custom && (
            <Button
              type="submit"
              variant="outline"
              formAction={resetLetterTemplate}
              formNoValidate
            >
              Reset to default
            </Button>
          )}
          {state.ok && <p className="text-sm text-green-600">Saved.</p>}
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        </div>
      </form>
    </section>
  );
}
