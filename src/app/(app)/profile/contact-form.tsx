"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import type { SelfUpdateState } from "./actions";

export function ContactForm({
  action,
  defaults,
}: {
  action: (
    prev: SelfUpdateState,
    formData: FormData,
  ) => Promise<SelfUpdateState>;
  defaults: {
    phone: string;
    personalEmail: string;
    emergencyContact?: string;
    fatherName?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
}) {
  const [state, formAction, pending] = useActionState<
    SelfUpdateState,
    FormData
  >(action, {});

  const fields = [
    ["phone", "Phone", defaults.phone, true, "tel"],
    ["personalEmail", "Personal email", defaults.personalEmail, true, "email"],
    ["emergencyContact", "Emergency contact", defaults.emergencyContact, false, "text"],
    ["fatherName", "Father's name", defaults.fatherName, false, "text"],
    ["address", "Address", defaults.address, false, "text"],
    ["city", "City", defaults.city, false, "text"],
    ["state", "State", defaults.state, false, "text"],
    ["pincode", "Pincode", defaults.pincode, false, "text"],
  ] as const;

  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="grid gap-4 rounded-lg border border-zinc-200 p-5 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800"
    >
      {fields.map(([name, label, value, required, type]) => (
        <FormField key={name} name={name} label={label} className="gap-1.5">
          <Input
            id={`me-${name}`}
            name={name}
            type={type}
            defaultValue={value}
            required={required}
            maxLength={name === "fatherName" ? 100 : undefined}
          />
        </FormField>
      ))}
      <div className="flex flex-wrap items-end gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Update contact info"}
        </Button>
        {state.ok && <p className="text-sm text-green-600">Saved.</p>}
        <FormMessage error={state.error} />
      </div>
    </ValidatedForm>
  );
}
