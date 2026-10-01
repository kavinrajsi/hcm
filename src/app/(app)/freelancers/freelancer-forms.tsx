"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import { addFreelancer, type FreelancerFormState } from "./actions";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

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
    <ValidatedForm
      ref={formRef}
      id="fl-add-form"
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 md:flex-row md:flex-wrap md:items-start dark:border-zinc-800"
    >
      <FormField name="name">
        <Input
          id="fl-name"
          name="name"
          placeholder="Name *"
          aria-label="Name"
          required
          className="w-full md:w-44"
        />
      </FormField>
      <FormField name="email">
        <Input
          name="email"
          type="email"
          placeholder="Email"
          aria-label="Email"
          className="w-full md:w-48"
        />
      </FormField>
      <FormField name="phone">
        <Input
          name="phone"
          placeholder="Phone"
          aria-label="Phone"
          className="w-full md:w-36"
        />
      </FormField>
      <FormField name="skillset">
        <Input
          name="skillset"
          placeholder="Skillset *"
          aria-label="Skillset"
          required
          className="w-full md:w-48"
        />
      </FormField>
      <FormField name="rate">
        <Input
          name="rate"
          placeholder="Rate"
          aria-label="Rate"
          className="w-full md:w-28"
        />
      </FormField>
      <FormField name="availability">
        <select
          name="availability"
          aria-label="Availability"
          className={`${selectClass} md:w-auto`}
          defaultValue="UNKNOWN"
        >
          {AVAILABILITY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField name="notes">
        <Input
          name="notes"
          placeholder="Notes"
          aria-label="Notes"
          className="w-full md:w-48"
        />
      </FormField>
      <Button type="submit" disabled={pending} className="w-full md:w-auto">
        {pending ? "Adding…" : "Add"}
      </Button>
      <FormMessage error={state.error} />
    </ValidatedForm>
  );
}
