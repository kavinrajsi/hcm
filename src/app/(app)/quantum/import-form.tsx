"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
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
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-start"
    >
      <FormField name="employeeId">
        <select
          name="employeeId"
          required
          aria-label="Import for employee"
          className={`${selectClass} md:w-52`}
        >
          <option value="">Import for employee…</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.empId} — {employee.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField name="projectId">
        <select
          name="projectId"
          required
          aria-label="Basecamp project"
          className={`${selectClass} md:w-52`}
        >
          <option value="">Basecamp project…</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </FormField>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="w-full md:w-auto"
      >
        {pending ? "Importing…" : "Import todos"}
      </Button>
      <FormMessage error={state.error} />
      {state.ok && !state.error && (
        <p className="text-sm text-green-600">Import complete.</p>
      )}
    </ValidatedForm>
  );
}
