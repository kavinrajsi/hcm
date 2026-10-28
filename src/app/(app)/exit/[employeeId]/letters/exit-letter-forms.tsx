"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import type { FormState } from "@/lib/form-state";
import type { ExitLetterType } from "@/lib/exit-letters";
import { EXIT_LETTER_TEMPLATES } from "@/lib/exit-letters";
import {
  generateExitLetter,
  saveExitLetterSignatory,
} from "./actions";

export function SignatoryForm({
  initial,
}: {
  initial: { name: string; designation: string } | null;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveExitLetterSignatory,
    {},
  );
  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 md:flex-row md:flex-wrap md:items-end dark:border-zinc-800"
    >
      <FormField name="name" label="Signed by">
        <Input
          id="name"
          name="name"
          required
          defaultValue={initial?.name ?? ""}
          className="md:w-64"
        />
      </FormField>
      <FormField name="designation" label="Designation">
        <Input
          id="designation"
          name="designation"
          required
          defaultValue={initial?.designation ?? ""}
          className="md:w-64"
        />
      </FormField>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save signatory"}
      </Button>
      <FormMessage error={state.error} />
      {typeof state.ok === "string" && (
        <p role="status" className="text-sm text-green-600">
          {state.ok}
        </p>
      )}
    </ValidatedForm>
  );
}

export function GenerateLetterButton({
  employeeId,
  type,
  disabled,
}: {
  employeeId: string;
  type: ExitLetterType;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    generateExitLetter,
    {},
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="type" value={type} />
      <div>
        <Button type="submit" disabled={pending || disabled}>
          {pending ? "Creating…" : `Create ${EXIT_LETTER_TEMPLATES[type].title.toLowerCase()} (PDF)`}
        </Button>
      </div>
      {state.fieldErrors?.type && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.fieldErrors.type[0]}
        </p>
      )}
      <FormMessage error={state.error} />
      {typeof state.ok === "string" && (
        <p role="status" className="text-sm text-green-600">
          {state.ok}
        </p>
      )}
    </form>
  );
}
