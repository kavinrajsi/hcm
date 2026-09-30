"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { drawSample, type SampleState } from "../actions";

/** HR: draw the labelling sample (holdout first, then dev, rest train). */
export function SampleForm({ drawn }: { drawn: number }) {
  const [state, formAction, pending] = useActionState<SampleState, FormData>(
    drawSample,
    {},
  );
  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-zinc-200 p-4 md:flex-row md:items-center dark:border-zinc-800"
    >
      <span className="text-sm md:mr-2">
        {drawn === 0
          ? "No labelling sample yet. Draw one from jobs that have comments:"
          : `${drawn} jobs in the sample. Add more:`}
      </span>
      <Input
        type="number"
        name="size"
        min={10}
        max={500}
        defaultValue={150}
        className="md:w-24"
        aria-label="Sample size"
      />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Drawing…" : "Draw sample"}
      </Button>
      {state.ok && <p className="text-sm text-emerald-600">{state.ok}</p>}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
