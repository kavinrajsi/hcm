"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { importFromBasecamp, type QuantumFormState } from "./actions";

export function BasecampImportForm({
  employees,
  projects,
}: {
  employees: { id: string; empId: string; name: string }[];
  projects: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    QuantumFormState,
    FormData
  >(importFromBasecamp, {});

  const selectClass =
    "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center"
    >
      <select name="employeeId" required className={`${selectClass} md:w-52`}>
        <option value="">Import for employee…</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.empId} — {e.name}
          </option>
        ))}
      </select>
      <select name="projectId" required className={`${selectClass} md:w-52`}>
        <option value="">Basecamp project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="w-full md:w-auto"
      >
        {pending ? "Importing…" : "Import todos"}
      </Button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-600">Import complete.</p>}
    </form>
  );
}
