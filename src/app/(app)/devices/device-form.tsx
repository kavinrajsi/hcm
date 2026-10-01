"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmployeeSelect, type Employee } from "@/components/employee-select";
import {
  DEVICE_OWNERSHIPS,
  DEVICE_OWNERSHIP_LABELS,
  DEVICE_TYPES,
  DEVICE_TYPE_LABELS,
} from "@/lib/devices/devices";
import type { DeviceOs, DeviceOwnership, DeviceType } from "@/generated/prisma/enums";
import { DEVICE_OSES, DEVICE_OS_LABELS } from "@/lib/devices/os";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
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
  ownership: DeviceOwnership;
  monthlyRent: string;
  vendorRef: string;
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
  ownership: "OWNED",
  monthlyRent: "",
  vendorRef: "",
  vendorId: "",
  warrantyEndsOn: "",
  notes: "",
};

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
  const [ownership, setOwnership] = useState<DeviceOwnership>(values.ownership);
  const rented = ownership === "RENTED";

  return (
    <ValidatedForm action={formAction} fieldErrors={state.fieldErrors} className="flex flex-col gap-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {requestId && <input type="hidden" name="requestId" value={requestId} />}
      <div className="grid gap-4 md:grid-cols-2">
        <FormField name="type" label="Type" hint={editing ? "The type is part of the asset tag, so it can't change." : undefined}>
          <select name="type" defaultValue={values.type} className={selectClass} disabled={editing}>
            {DEVICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {DEVICE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          {editing && <input type="hidden" name="type" value={values.type} />}
        </FormField>
        <FormField name="brand" label="Brand">
          <Input name="brand" required defaultValue={values.brand} placeholder="Apple, Dell, Logitech…" />
        </FormField>
        <FormField name="model" label="Model">
          <Input name="model" required defaultValue={values.model} placeholder="MacBook Air M3 13-inch" />
        </FormField>
        <FormField name="serialNumber" label="Serial number">
          <Input name="serialNumber" defaultValue={values.serialNumber} />
        </FormField>
        <FormField name="os" label="Operating system" hint="For laptops: Mac or Windows.">
          <select name="os" defaultValue={values.os} className={selectClass}>
            <option value="">Not set</option>
            {DEVICE_OSES.map((os) => (
              <option key={os} value={os}>
                {DEVICE_OS_LABELS[os]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField name="ownership" label="Owned or rented">
          <select
            name="ownership"
            value={ownership}
            onChange={(event) => setOwnership(event.target.value as DeviceOwnership)}
            className={selectClass}
          >
            {DEVICE_OWNERSHIPS.map((value) => (
              <option key={value} value={value}>
                {DEVICE_OWNERSHIP_LABELS[value]}
              </option>
            ))}
          </select>
        </FormField>
        {rented ? (
          <>
            <FormField name="monthlyRent" label="Monthly rent (₹)">
              <Input name="monthlyRent" inputMode="decimal" pattern="\d+(\.\d{1,2})?" title="Enter an amount like 2500 or 2500.50" required defaultValue={values.monthlyRent} />
            </FormField>
            <FormField name="vendorRef" label="Vendor's reference" hint="Their own label for it, e.g. Laptop2.">
              <Input name="vendorRef" defaultValue={values.vendorRef} />
            </FormField>
            <FormField name="purchaseDate" label="Rented since (optional)">
              <Input type="date" name="purchaseDate" defaultValue={values.purchaseDate} />
            </FormField>
          </>
        ) : (
          <>
            <FormField name="purchaseDate" label="Purchase date">
              <Input type="date" name="purchaseDate" defaultValue={values.purchaseDate} />
            </FormField>
            <FormField name="purchasePrice" label="Purchase price (₹)">
              <Input name="purchasePrice" inputMode="decimal" pattern="\d+(\.\d{1,2})?" title="Enter an amount like 45000 or 45000.50" defaultValue={values.purchasePrice} />
            </FormField>
            <FormField name="vendorRef" label="Vendor's reference (optional)">
              <Input name="vendorRef" defaultValue={values.vendorRef} />
            </FormField>
          </>
        )}
        <FormField name="vendorId" label={rented ? "Rented from" : "Bought from"}>
          <select name="vendorId" defaultValue={values.vendorId} required={rented} className={selectClass}>
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
        </FormField>
        <FormField name="warrantyEndsOn" label="Warranty ends">
          <Input type="date" name="warrantyEndsOn" defaultValue={values.warrantyEndsOn} />
        </FormField>
      </div>
      <FormField name="specs" label="Specs">
        <Textarea name="specs" rows={2} defaultValue={values.specs} placeholder="16 GB RAM, 512 GB SSD" />
      </FormField>
      <FormField name="notes" label="Notes">
        <Textarea name="notes" rows={2} defaultValue={values.notes} />
      </FormField>

      {!editing && employees && (
        <div className="grid gap-4 rounded-xl border border-dashed border-zinc-200 p-4 md:grid-cols-2 dark:border-zinc-800">
          <FormField name="employeeId" htmlFor="employeeId" label="Assign to (optional)" hint="Leave empty to keep it in stock.">
            <EmployeeSelect
              id="employeeId"
              name="employeeId"
              employees={employees}
              selectedId={holder}
              onSelect={setHolder}
            />
          </FormField>
          {holder && (
            <FormField name="conditionOut" label="Condition when handed over">
              <Input name="conditionOut" placeholder="New, sealed box" />
            </FormField>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add device"}
        </Button>
        <FormMessage error={state.error} ok={state.ok} />
      </div>
    </ValidatedForm>
  );
}
