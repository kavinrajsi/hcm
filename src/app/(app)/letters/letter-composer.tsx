"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailEditor } from "@/components/email-editor";
import { generateLetter, sendLetter, type LetterFormState } from "./actions";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

const TYPES = [
  ["OFFER", "Offer letter"],
  ["INTERN", "Intern letter"],
  ["COMPENSATION", "Revised compensation"],
] as const;

export function LetterComposer({
  employees,
}: {
  employees: { id: string; empId: string; name: string }[];
}) {
  const [genState, genAction, genPending] = useActionState<
    LetterFormState,
    FormData
  >(generateLetter, {});
  const [sendState, sendAction, sendPending] = useActionState<
    LetterFormState,
    FormData
  >(sendLetter, {});

  const draft = genState.draft;
  // Keyed per draft below, so a new draft resets the editor and subject.
  const draftKey = draft
    ? `${draft.employeeId}-${draft.type}-${draft.subject}`
    : "none";

  return (
    <div className="flex flex-col gap-4">
      <form
        action={genAction}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 md:flex-row md:flex-wrap md:items-end dark:border-zinc-800"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="l-emp" className="text-sm font-medium">
            Employee
          </label>
          <select
            id="l-emp"
            name="employeeId"
            required
            className={`${selectClass} w-full md:w-56`}
          >
            <option value="">Select…</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.empId} — {employee.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="l-type" className="text-sm font-medium">
            Letter type
          </label>
          <select
            id="l-type"
            name="type"
            className={`${selectClass} w-full md:w-52`}
          >
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={genPending}>
          {genPending ? "Generating…" : "Generate draft"}
        </Button>
        {genState.error && (
          <p className="text-sm text-red-600">{genState.error}</p>
        )}
      </form>

      {draft && (
        <DraftForm
          key={draftKey}
          draft={draft}
          sendAction={sendAction}
          sendState={sendState}
          sendPending={sendPending}
        />
      )}
    </div>
  );
}

function DraftForm({
  draft,
  sendAction,
  sendState,
  sendPending,
}: {
  draft: NonNullable<LetterFormState["draft"]>;
  sendAction: (formData: FormData) => void;
  sendState: LetterFormState;
  sendPending: boolean;
}) {
  const [subject, setSubject] = useState(draft.subject);
  return (
    <>
      {
        <form
          action={sendAction}
          className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <input type="hidden" name="employeeId" value={draft.employeeId} />
          <input type="hidden" name="type" value={draft.type} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="l-subject" className="text-sm font-medium">
              Subject
            </label>
            <Input
              id="l-subject"
              name="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Body — edit before sending
            </span>
            <EmailEditor
              name="bodyHtml"
              defaultValue={draft.bodyHtml}
              subject={subject}
              label="Letter body"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={sendPending}>
              {sendPending ? "Sending…" : "Send letter"}
            </Button>
            {sendState.ok && !sendState.error && (
              <p className="text-sm text-green-600">
                Letter sent and archived.
              </p>
            )}
            {sendState.error && (
              <p className="text-sm text-amber-600">{sendState.error}</p>
            )}
          </div>
        </form>
      }
    </>
  );
}
