"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addFreelancer, type FreelancerFormState } from "./actions";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

export const AVAILABILITY_OPTIONS = [
  ["AVAILABLE", "Available"],
  ["BUSY", "Busy"],
  ["UNAVAILABLE", "Unavailable"],
  ["UNKNOWN", "Unknown"],
] as const;

/** Fast inline add — single row of inputs, clears on success. */
export function FreelancerAddForm() {
  // Direct server-action reference keeps progressive enhancement intact;
  // the reset happens in an effect once the action reports success.
  const [state, formAction, pending] = useActionState<
    FreelancerFormState,
    FormData
  >(addFreelancer, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      document.getElementById("fl-name")?.focus();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      id="fl-add-form"
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <Input id="fl-name" name="name" placeholder="Name *" required className="w-44" />
      <Input name="email" type="email" placeholder="Email" className="w-48" />
      <Input name="phone" placeholder="Phone" className="w-36" />
      <Input name="skillset" placeholder="Skillset *" required className="w-48" />
      <Input name="rate" placeholder="Rate" className="w-28" />
      <select name="availability" className={selectClass} defaultValue="UNKNOWN">
        {AVAILABILITY_OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <Input name="notes" placeholder="Notes" className="w-48" />
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
