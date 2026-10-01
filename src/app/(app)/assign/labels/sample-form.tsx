"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import { drawSample, type SampleState } from "../actions";

/** HR: draw the labelling sample (holdout first, then dev, rest train). */
export function SampleForm({ drawn }: { drawn: number }) {
  const [state, formAction, pending] = useActionState<SampleState, FormData>(
    drawSample,
    {},
  );
  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-zinc-200 p-4 md:flex-row md:items-start dark:border-zinc-800"
    >
      <span className="text-sm md:mr-2 md:leading-9">
        {drawn === 0
          ? "No labelling sample yet. Draw one from jobs that have comments:"
          : `${drawn} jobs in the sample. Add more:`}
      </span>
      <FormField name="size" className="md:w-24">
        <Input
          type="number"
          name="size"
          min={10}
          max={500}
          defaultValue={150}
          aria-label="Sample size"
        />
      </FormField>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Drawing…" : "Draw sample"}
      </Button>
      <div className="md:pt-2">
        <FormMessage error={state.error} ok={state.ok} />
      </div>
    </ValidatedForm>
  );
}
