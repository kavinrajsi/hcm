"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markExit, type ExitFormState } from "./actions";

export function ExitForm({
  activeEmployees,
}: {
  activeEmployees: { id: string; empId: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ExitFormState, FormData>(
    markExit,
    {},
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="employeeId" className="text-sm font-medium">
          Employee
        </label>
        <select
          id="employeeId"
          name="employeeId"
          required
          className="h-9 w-64 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
        >
          <option value="">Select employee…</option>
          {activeEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.empId} — {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="dateOfExit" className="text-sm font-medium">
          Date of exit
        </label>
        <Input id="dateOfExit" name="dateOfExit" type="date" required className="w-44" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record exit"}
      </Button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-green-600">
          Exit recorded — ID card flagged for return.
        </p>
      )}
    </form>
  );
}
