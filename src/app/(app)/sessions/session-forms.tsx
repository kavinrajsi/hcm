"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSession,
  logAttendance,
  type SessionFormState,
} from "./actions";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

export function NewSessionForm() {
  const [state, formAction, pending] = useActionState<
    SessionFormState,
    FormData
  >(createSession, {});

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="s-name" className="text-sm font-medium">
          Session name
        </label>
        <Input id="s-name" name="name" required className="w-56" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="s-date" className="text-sm font-medium">
          Date & time
        </label>
        <Input
          id="s-date"
          name="date"
          type="datetime-local"
          required
          className="w-52"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="s-trainer" className="text-sm font-medium">
          Trainer
        </label>
        <Input id="s-trainer" name="trainer" required className="w-44" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="s-mode" className="text-sm font-medium">
          Mode
        </label>
        <select id="s-mode" name="mode" className={selectClass}>
          <option value="IN_PERSON">In-person</option>
          <option value="VIRTUAL">Virtual</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add session"}
      </Button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
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
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="a-emp" className="text-sm font-medium">
          Employee
        </label>
        <select
          id="a-emp"
          name="employeeId"
          required
          className={`${selectClass} w-52`}
        >
          <option value="">Select…</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.empId} — {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="a-session" className="text-sm font-medium">
          Calendar session (optional)
        </label>
        <select
          id="a-session"
          name="sessionId"
          className={`${selectClass} w-56`}
          onChange={(e) => {
            const s = sessions.find((x) => x.id === e.target.value);
            if (!s) return;
            const form = e.target.form!;
            (form.elements.namedItem("sessionName") as HTMLInputElement).value =
              s.name;
            (form.elements.namedItem("trainer") as HTMLInputElement).value =
              s.trainer;
            (form.elements.namedItem("date") as HTMLInputElement).value =
              s.date;
          }}
        >
          <option value="">— manual entry —</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.date})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="a-name" className="text-sm font-medium">
          Session name
        </label>
        <Input id="a-name" name="sessionName" required className="w-52" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="a-date" className="text-sm font-medium">
          Date
        </label>
        <Input id="a-date" name="date" type="date" required className="w-40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="a-trainer" className="text-sm font-medium">
          Trainer
        </label>
        <Input id="a-trainer" name="trainer" className="w-40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="a-notes" className="text-sm font-medium">
          Notes
        </label>
        <Input id="a-notes" name="notes" className="w-48" />
      </div>
      <div className="flex items-center gap-2 pb-2">
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
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Logging…" : "Log attendance"}
      </Button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-600">Logged.</p>}
    </form>
  );
}
