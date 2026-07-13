"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      {showEmployeePicker ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="q-emp" className="text-sm font-medium">
            Employee
          </label>
          <select
            id="q-emp"
            name="employeeId"
            required
            defaultValue={employeeId ?? ""}
            className="h-9 w-52 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            <option value="">Select…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.empId} — {e.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="employeeId" value={employeeId} />
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="q-date" className="text-sm font-medium">
          Date
        </label>
        <Input id="q-date" name="date" type="date" required className="w-40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="q-brand" className="text-sm font-medium">
          Brand
        </label>
        <Input id="q-brand" name="brand" required className="w-36" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="q-work" className="text-sm font-medium">
          Name of the work
        </label>
        <Input id="q-work" name="workName" required className="w-56" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="q-link" className="text-sm font-medium">
          Basecamp/Figma link
        </label>
        <Input id="q-link" name="link" type="url" className="w-56" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="q-mins" className="text-sm font-medium">
          Duration (mins)
        </label>
        <Input
          id="q-mins"
          name="durationMins"
          type="number"
          min="0"
          required
          className="w-28"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add entry"}
      </Button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
