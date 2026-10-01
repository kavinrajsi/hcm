"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FieldError, FormField, FormMessage } from "@/components/form/form-field";
import { createSession, logAttendance, type SessionFormState } from "./actions";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

export function NewSessionForm() {
  const [state, formAction, pending] = useActionState<
    SessionFormState,
    FormData
  >(createSession, {});

  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 md:flex-row md:flex-wrap md:items-end dark:border-zinc-800"
    >
      <FormField name="name" label="Session name">
        <Input id="s-name" name="name" required className="w-full md:w-56" />
      </FormField>
      <FormField name="date" label="Date & time">
        <Input
          id="s-date"
          name="date"
          type="datetime-local"
          required
          className="w-full md:w-52"
        />
      </FormField>
      <FormField name="trainer" label="Trainer">
        <Input
          id="s-trainer"
          name="trainer"
          required
          className="w-full md:w-44"
        />
      </FormField>
      <FormField name="mode" label="Mode">
        <select id="s-mode" name="mode" className={`${selectClass} md:w-auto`}>
          <option value="IN_PERSON">In-person</option>
          <option value="VIRTUAL">Virtual</option>
        </select>
      </FormField>
      <Button type="submit" disabled={pending} className="w-full md:w-auto">
        {pending ? "Adding…" : "Add session"}
      </Button>
      <FormMessage error={state.error} />
    </ValidatedForm>
  );
}

export function AttendanceForm({
  employees,
  sessions,
}: {
  employees: { id: string; empId: string; name: string }[];
  sessions: { id: string; name: string; trainer: string; date: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    SessionFormState,
    FormData
  >(logAttendance, {});

  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 md:flex-row md:flex-wrap md:items-end dark:border-zinc-800"
    >
      <FormField name="employeeId" label="Employee">
        <select
          id="a-emp"
          name="employeeId"
          required
          className={`${selectClass} md:w-52`}
        >
          <option value="">Select…</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.empId} — {employee.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField name="sessionId" label="Calendar session (optional)">
        <select
          id="a-session"
          name="sessionId"
          className={`${selectClass} md:w-56`}
          onChange={(event) => {
            const session = sessions.find(
              (option) => option.id === event.target.value,
            );
            if (!session) return;
            const form = event.target.form!;
            (form.elements.namedItem("sessionName") as HTMLInputElement).value =
              session.name;
            (form.elements.namedItem("trainer") as HTMLInputElement).value =
              session.trainer;
            (form.elements.namedItem("date") as HTMLInputElement).value =
              session.date;
          }}
        >
          <option value="">— manual entry —</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.name} ({session.date})
            </option>
          ))}
        </select>
      </FormField>
      <FormField name="sessionName" label="Session name">
        <Input
          id="a-name"
          name="sessionName"
          required
          className="w-full md:w-52"
        />
      </FormField>
      <FormField name="date" label="Date">
        <Input
          id="a-date"
          name="date"
          type="date"
          required
          className="w-full md:w-40"
        />
      </FormField>
      <FormField name="trainer" label="Trainer">
        <Input id="a-trainer" name="trainer" className="w-full md:w-40" />
      </FormField>
      <FormField name="notes" label="Notes">
        <Input id="a-notes" name="notes" className="w-full md:w-48" />
      </FormField>
      <div className="flex min-h-10 items-center gap-2 md:min-h-0 md:pb-2">
        <input
          id="a-attended"
          name="attended"
          type="checkbox"
          defaultChecked
          className="size-4"
        />
        <label htmlFor="a-attended" className="text-sm font-medium">
          Attended
        </label>
        <FieldError name="attended" />
      </div>
      <Button type="submit" disabled={pending} className="w-full md:w-auto">
        {pending ? "Logging…" : "Log attendance"}
      </Button>
      <FormMessage error={state.error} />
      {state.ok && !state.error && (
        <p className="text-sm text-green-600">Logged.</p>
      )}
    </ValidatedForm>
  );
}
