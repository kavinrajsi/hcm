"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import { addQuantumEntry, type QuantumFormState } from "./actions";

export function QuantumEntryForm({
  employeeId,
  showEmployeePicker,
  employees = [],
}: {
  employeeId?: string;
  showEmployeePicker?: boolean;
  employees?: { id: string; empId: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    QuantumFormState,
    FormData
  >(addQuantumEntry, {});

  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 md:flex-row md:flex-wrap md:items-end dark:border-zinc-800"
    >
      {showEmployeePicker ? (
        <FormField name="employeeId" label="Employee">
          <select
            id="q-emp"
            name="employeeId"
            required
            defaultValue={employeeId ?? ""}
            className="h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:w-52 md:text-sm dark:bg-input/30"
          >
            <option value="">Select…</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.empId} — {employee.name}
              </option>
            ))}
          </select>
        </FormField>
      ) : (
        <input type="hidden" name="employeeId" value={employeeId} />
      )}
      <FormField name="date" label="Date">
        <Input
          id="q-date"
          name="date"
          type="date"
          required
          className="w-full md:w-40"
        />
      </FormField>
      <FormField name="brand" label="Brand">
        <Input id="q-brand" name="brand" required className="w-full md:w-36" />
      </FormField>
      <FormField name="workName" label="Name of the work">
        <Input
          id="q-work"
          name="workName"
          required
          className="w-full md:w-56"
        />
      </FormField>
      <FormField name="link" label="Basecamp/Figma link">
        <Input id="q-link" name="link" type="url" className="w-full md:w-56" />
      </FormField>
      <FormField name="durationMins" label="Duration (mins)">
        <Input
          id="q-mins"
          name="durationMins"
          type="number"
          min="0"
          step="1"
          required
          className="w-full md:w-28"
        />
      </FormField>
      <Button type="submit" disabled={pending} className="w-full md:w-auto">
        {pending ? "Adding…" : "Add entry"}
      </Button>
      <FormMessage error={state.error} />
    </ValidatedForm>
  );
}
