"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VENDOR_KINDS, VENDOR_KIND_LABELS } from "@/lib/devices/vendors";
import type { VendorKind } from "@/generated/prisma/enums";
import { createVendor, updateVendor, type VendorFormState } from "./actions";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

export type VendorValues = {
  id?: string;
  name: string;
  kind: VendorKind;
  contactPerson: string;
  email: string;
  phone: string;
  altPhone: string;
  address: string;
  notes: string;
};

export const EMPTY_VENDOR: VendorValues = {
  name: "",
  kind: "BOTH",
  contactPerson: "",
  email: "",
  phone: "",
  altPhone: "",
  address: "",
  notes: "",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export function VendorForm({ values, back }: { values: VendorValues; back?: string }) {
  const editing = Boolean(values.id);
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(
    editing ? updateVendor : createVendor,
    {},
  );
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {back && <input type="hidden" name="back" value={back} />}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Vendor name">
          <Input name="name" required defaultValue={values.name} placeholder="Apple Care T Nagar" />
        </Field>
        <Field label="What they do">
          <select name="kind" defaultValue={values.kind} className={selectClass}>
            {VENDOR_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {VENDOR_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contact person">
          <Input name="contactPerson" defaultValue={values.contactPerson} autoComplete="off" />
        </Field>
        <Field label="Email">
          <Input type="email" name="email" defaultValue={values.email} autoComplete="off" />
        </Field>
        <Field label="Phone number">
          <Input type="tel" name="phone" required defaultValue={values.phone} placeholder="+91 98400 12345" />
        </Field>
        <Field label="Alternative phone number">
          <Input type="tel" name="altPhone" defaultValue={values.altPhone} />
        </Field>
      </div>
      <Field label="Address">
        <Textarea name="address" rows={2} defaultValue={values.address} />
      </Field>
      <Field label="Notes">
        <Textarea name="notes" rows={2} defaultValue={values.notes} placeholder="Turnaround time, warranty terms, account number…" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add vendor"}
        </Button>
        {state.ok && <p className="text-sm text-emerald-600">{state.ok}</p>}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
