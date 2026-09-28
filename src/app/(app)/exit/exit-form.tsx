"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmployeeSelect, type Employee } from "@/components/employee-select";
import { markExit, type ExitFormState } from "./actions";

export function ExitForm({ activeEmployees }: { activeEmployees: Employee[] }) {
  const [state, formAction, pending] = useActionState<ExitFormState, FormData>(
    markExit,
    {},
  );
  // Shared by the phone picker and the desktop select. An employee who has
  // just exited drops out of the list, which clears the selection.
  const [selectedId, setSelectedId] = useState("");
  const selected = activeEmployees.find(
    (employee) => employee.id === selectedId,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 md:flex-row md:flex-wrap md:items-end dark:border-zinc-800"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="employee-desktop"
          className="hidden text-sm font-medium md:block"
        >
          Employee
        </label>
        <label
          htmlFor="employee-phone"
          className="text-sm font-medium md:hidden"
        >
          Employee
        </label>
        <EmployeeSelect
          id="employee"
          name="employeeId"
          employees={activeEmployees}
          selectedId={selected?.id ?? ""}
          onSelect={setSelectedId}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="dateOfExit" className="text-sm font-medium">
          Date of exit
        </label>
        <Input
          id="dateOfExit"
          name="dateOfExit"
          type="date"
          required
          className="md:w-44"
        />
      </div>
      <Button type="submit" disabled={pending || !selected}>
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
