"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
}) {
  const [state, formAction, pending] = useActionState<SelfUpdateState, FormData>(
    action,
    {},
  );

  const fields = [
    ["phone", "Phone", defaults.phone, true],
    ["personalEmail", "Personal email", defaults.personalEmail, true],
    ["emergencyContact", "Emergency contact", defaults.emergencyContact, false],
    ["address", "Address", defaults.address, false],
    ["city", "City", defaults.city, false],
    ["state", "State", defaults.state, false],
    ["pincode", "Pincode", defaults.pincode, false],
  ] as const;

  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-lg border border-zinc-200 p-5 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800"
    >
      {fields.map(([name, label, value, required]) => (
        <div key={name} className="flex flex-col gap-1.5">
          <Label htmlFor={`me-${name}`}>{label}</Label>
          <Input
            id={`me-${name}`}
            name={name}
            defaultValue={value}
            required={required}
          />
        </div>
      ))}
      <div className="flex items-end gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Update contact info"}
        </Button>
        {state.ok && <p className="text-sm text-green-600">Saved.</p>}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
