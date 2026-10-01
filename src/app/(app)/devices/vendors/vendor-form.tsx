"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VENDOR_KINDS, VENDOR_KIND_LABELS } from "@/lib/devices/vendors";
import type { VendorKind } from "@/generated/prisma/enums";
import { createVendor, updateVendor, type VendorFormState } from "./actions";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

export type ContactValues = {
  name: string;
  role: string;
  email: string;
  phone: string;
  altPhone: string;
  isPrimary: boolean;
};

export type VendorValues = {
  id?: string;
  name: string;
  kind: VendorKind;
  contacts: ContactValues[];
  email: string;
  phone: string;
  altPhone: string;
  address: string;
  notes: string;
};

export const EMPTY_VENDOR: VendorValues = {
  name: "",
  kind: "BOTH",
  contacts: [],
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
  const blank: ContactValues = { name: "", role: "", email: "", phone: "", altPhone: "", isPrimary: false };
  const [contacts, setContacts] = useState<ContactValues[]>(
    values.contacts.length ? values.contacts : [{ ...blank, isPrimary: true }],
  );
  const change = (index: number, patch: Partial<ContactValues>) =>
    setContacts((rows) =>
      rows.map((row, i) =>
        i === index ? { ...row, ...patch } : patch.isPrimary ? { ...row, isPrimary: false } : row,
      ),
    );
  const remove = (index: number) =>
    setContacts((rows) => {
      const next = rows.filter((_, i) => i !== index);
      if (next.length && !next.some((row) => row.isPrimary)) next[0] = { ...next[0], isPrimary: true };
      return next;
    });
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(
    editing ? updateVendor : createVendor,
    {},
  );
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {back && <input type="hidden" name="back" value={back} />}
      <input type="hidden" name="contacts" value={JSON.stringify(contacts)} />
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
        <Field label="Company email">
          <Input type="email" name="email" defaultValue={values.email} autoComplete="off" />
        </Field>
        <Field label="Company phone">
          <Input type="tel" name="phone" required defaultValue={values.phone} placeholder="+91 98400 12345" />
        </Field>
        <Field label="Company alternative phone">
          <Input type="tel" name="altPhone" defaultValue={values.altPhone} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Contact people</legend>
        {contacts.map((contact, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-xl border border-zinc-200 p-3 md:grid-cols-[1fr_1fr_1fr] dark:border-zinc-800"
          >
            <Input
              aria-label="Contact name"
              placeholder="Name"
              value={contact.name}
              onChange={(event) => change(index, { name: event.target.value })}
            />
            <Input
              aria-label="Contact role"
              placeholder="Role (Sales, Service, Accounts…)"
              value={contact.role}
              onChange={(event) => change(index, { role: event.target.value })}
            />
            <Input
              aria-label="Contact email"
              type="email"
              placeholder="Email"
              value={contact.email}
              onChange={(event) => change(index, { email: event.target.value })}
            />
            <Input
              aria-label="Contact phone"
              type="tel"
              placeholder="Phone"
              value={contact.phone}
              onChange={(event) => change(index, { phone: event.target.value })}
            />
            <Input
              aria-label="Contact alternative phone"
              type="tel"
              placeholder="Alternative phone"
              value={contact.altPhone}
              onChange={(event) => change(index, { altPhone: event.target.value })}
            />
            <div className="flex items-center justify-between gap-2">
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="primaryContact"
                  checked={contact.isPrimary}
                  onChange={() => change(index, { isPrimary: true })}
                  className="size-4 accent-primary"
                />
                Primary
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setContacts((rows) => [...rows, { ...blank, isPrimary: rows.length === 0 }])}
          >
            Add contact person
          </Button>
        </div>
      </fieldset>
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
