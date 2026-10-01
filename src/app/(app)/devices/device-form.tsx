"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmployeeSelect, type Employee } from "@/components/employee-select";
import { DEVICE_TYPES, DEVICE_TYPE_LABELS } from "@/lib/devices/devices";
import type { DeviceType } from "@/generated/prisma/enums";
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
  purchaseDate: string;
  purchasePrice: string;
  vendor: string;
  warrantyEndsOn: string;
  notes: string;
};

export const EMPTY_DEVICE: DeviceValues = {
  type: "LAPTOP",
  brand: "",
  model: "",
  serialNumber: "",
  specs: "",
  purchaseDate: "",
  purchasePrice: "",
  vendor: "",
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
export function DeviceForm({
  values,
  employees,
}: {
  values: DeviceValues;
  employees?: Employee[];
}) {
  const editing = Boolean(values.id);
  const [state, formAction, pending] = useActionState<DeviceFormState, FormData>(
    editing ? updateDevice : createDevice,
    {},
  );
  const [holder, setHolder] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
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
        <Field label="Purchase date">
          <Input type="date" name="purchaseDate" defaultValue={values.purchaseDate} />
        </Field>
        <Field label="Purchase price (₹)">
          <Input name="purchasePrice" inputMode="decimal" defaultValue={values.purchasePrice} />
        </Field>
        <Field label="Vendor">
          <Input name="vendor" defaultValue={values.vendor} />
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
