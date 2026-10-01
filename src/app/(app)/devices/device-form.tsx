"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmployeeSelect, type Employee } from "@/components/employee-select";
import { DEVICE_TYPES, DEVICE_TYPE_LABELS } from "@/lib/devices/devices";
import type { DeviceOs, DeviceType } from "@/generated/prisma/enums";
import { DEVICE_OSES, DEVICE_OS_LABELS } from "@/lib/devices/os";
import { createDevice, updateDevice, type DeviceFormState } from "./actions";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

export type DeviceValues = {
  id?: string;
  type: DeviceType;
  brand: string;
  model: string;
  serialNumber: string;
  specs: string;
  os: DeviceOs | "";
  purchaseDate: string;
  purchasePrice: string;
  vendorId: string;
  warrantyEndsOn: string;
  notes: string;
};

export const EMPTY_DEVICE: DeviceValues = {
  type: "LAPTOP",
  brand: "",
  model: "",
  serialNumber: "",
  specs: "",
  os: "",
  purchaseDate: "",
  purchasePrice: "",
  vendorId: "",
  warrantyEndsOn: "",
  notes: "",
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

/** Add (with optional first holder) or edit a device. HR only. */
export type VendorOption = { id: string; name: string };

export function DeviceForm({
  values,
  employees,
  vendors,
  addVendorHref,
  initialHolder = "",
  requestId,
}: {
  values: DeviceValues;
  employees?: Employee[];
  /** Active vendors that sell devices (plus the current one when editing). */
  vendors: VendorOption[];
  addVendorHref: string;
  /** Pre-selected first holder (new device only). */
  initialHolder?: string;
  /** Purchase request this device fulfils. */
  requestId?: string;
}) {
  const editing = Boolean(values.id);
  const [state, formAction, pending] = useActionState<DeviceFormState, FormData>(
    editing ? updateDevice : createDevice,
    {},
  );
  const [holder, setHolder] = useState(initialHolder);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {requestId && <input type="hidden" name="requestId" value={requestId} />}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Type" hint={editing ? "The type is part of the asset tag, so it can't change." : undefined}>
          <select name="type" defaultValue={values.type} className={selectClass} disabled={editing}>
            {DEVICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {DEVICE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          {editing && <input type="hidden" name="type" value={values.type} />}
        </Field>
        <Field label="Brand">
          <Input name="brand" required defaultValue={values.brand} placeholder="Apple, Dell, Logitech…" />
        </Field>
        <Field label="Model">
          <Input name="model" required defaultValue={values.model} placeholder="MacBook Air M3 13-inch" />
        </Field>
        <Field label="Serial number">
          <Input name="serialNumber" defaultValue={values.serialNumber} />
        </Field>
        <Field label="Operating system" hint="For laptops: Mac or Windows.">
          <select name="os" defaultValue={values.os} className={selectClass}>
            <option value="">Not set</option>
            {DEVICE_OSES.map((os) => (
              <option key={os} value={os}>
                {DEVICE_OS_LABELS[os]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Purchase date">
          <Input type="date" name="purchaseDate" defaultValue={values.purchaseDate} />
        </Field>
        <Field label="Purchase price (₹)">
          <Input name="purchasePrice" inputMode="decimal" defaultValue={values.purchasePrice} />
        </Field>
        <Field label="Bought from">
          <select name="vendorId" defaultValue={values.vendorId} className={selectClass}>
            <option value="">Not recorded</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
          <a href={addVendorHref} className="text-xs text-zinc-500 underline-offset-4 hover:underline">
            Vendor not listed? Add one
          </a>
        </Field>
        <Field label="Warranty ends">
          <Input type="date" name="warrantyEndsOn" defaultValue={values.warrantyEndsOn} />
        </Field>
      </div>
      <Field label="Specs">
        <Textarea name="specs" rows={2} defaultValue={values.specs} placeholder="16 GB RAM, 512 GB SSD" />
      </Field>
      <Field label="Notes">
        <Textarea name="notes" rows={2} defaultValue={values.notes} />
      </Field>

      {!editing && employees && (
        <div className="grid gap-4 rounded-xl border border-dashed border-zinc-200 p-4 md:grid-cols-2 dark:border-zinc-800">
          <Field label="Assign to (optional)" hint="Leave empty to keep it in stock.">
            <EmployeeSelect
              id="employeeId"
              name="employeeId"
              employees={employees}
              selectedId={holder}
              onSelect={setHolder}
            />
          </Field>
          {holder && (
            <Field label="Condition when handed over">
              <Input name="conditionOut" placeholder="New, sealed box" />
            </Field>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add device"}
        </Button>
        {state.ok && <p className="text-sm text-emerald-600">{state.ok}</p>}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
