"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import { EmployeeSelect, type Employee } from "@/components/employee-select";
import { FileUpload } from "../_components/file-upload";
import { NotesEditor } from "../_components/notes-editor";
import {
  addAssignment,
  addFaq,
  addLesson,
  addLiveClass,
  addSection,
  createCourse,
  renameSection,
  updateCourse,
  updateFaq,
  updateLesson,
  type LearningFormState,
} from "./actions";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

type Action = (prev: LearningFormState, formData: FormData) => Promise<LearningFormState>;

function useForm(action: Action) {
  const [state, formAction, pending] = useActionState<LearningFormState, FormData>(action, {});
  return { state, formAction, pending };
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={pending} className="w-full md:w-auto">
      {pending ? "Saving…" : children}
    </Button>
  );
}

function Saved({ state }: { state: LearningFormState }) {
  if (typeof state.ok !== "string") return null;
  return <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p>;
}

// --- Course ------------------------------------------------------------------

export type CourseDefaults = {
  title: string;
  description: string;
  instructor: string | null;
  coverKey: string | null;
  openToAll: boolean;
};

export function CourseForm({ courseId, defaults }: { courseId?: string; defaults?: CourseDefaults }) {
  const { state, formAction, pending } = useForm(courseId ? updateCourse.bind(null, courseId) : createCourse);
  return (
    <ValidatedForm action={formAction} fieldErrors={state.fieldErrors} className="flex flex-col gap-4">
      <FormField name="title" label="Title">
        <Input name="title" required defaultValue={defaults?.title} maxLength={200} />
      </FormField>
      <FormField name="instructor" label="Instructor" hint="Shown under the title on course cards.">
        <Input name="instructor" defaultValue={defaults?.instructor ?? ""} />
      </FormField>
      <FormField name="description" label="About the course">
        <Textarea name="description" rows={5} defaultValue={defaults?.description} maxLength={5000} />
      </FormField>
      <FileUpload name="coverKey" kind="image" label="Cover image (16:9)" defaultKey={defaults?.coverKey} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="openToAll" defaultChecked={defaults?.openToAll} className="mt-0.5 size-4" />
        <span>
          <span className="font-medium">Open to everyone</span>
          <span className="block text-zinc-500">
            Listed under Explore so anyone can start it. Otherwise only people it&apos;s assigned to see it.
          </span>
        </span>
      </label>
      <FormMessage error={state.error} />
      <Saved state={state} />
      <div>
        <Submit pending={pending}>{courseId ? "Save details" : "Create course"}</Submit>
      </div>
    </ValidatedForm>
  );
}

// --- Sections ----------------------------------------------------------------

export function AddSectionForm({ courseId }: { courseId: string }) {
  const [round, setRound] = useState(0);
  const action = addSection.bind(null, courseId);
  const { state, formAction, pending } = useForm(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok) setRound((value) => value + 1);
    return result;
  });
  return (
    <ValidatedForm
      key={round}
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-2 md:flex-row md:items-end"
    >
      <FormField name="title" label="New section" className="flex-1">
        <Input name="title" required placeholder="e.g. Week 1 — Foundations" maxLength={200} />
      </FormField>
      <Submit pending={pending}>Add section</Submit>
    </ValidatedForm>
  );
}

export function RenameSectionForm({ sectionId, title }: { sectionId: string; title: string }) {
  const { state, formAction, pending } = useForm(renameSection.bind(null, sectionId));
  return (
    <ValidatedForm action={formAction} fieldErrors={state.fieldErrors} className="flex flex-1 items-end gap-2">
      <FormField name="title" label="Section title" className="flex-1">
        <Input name="title" required defaultValue={title} maxLength={200} />
      </FormField>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Rename
      </Button>
    </ValidatedForm>
  );
}

// --- Lessons -----------------------------------------------------------------

export type LessonDefaults = {
  title: string;
  kind: "PDF" | "VIDEO" | "YOUTUBE" | "VIMEO";
  fileKey: string | null;
  url: string | null;
  notes: string | null;
  durationMins: number | null;
};

const KIND_LABELS = { PDF: "PDF", VIDEO: "Uploaded video", YOUTUBE: "YouTube video", VIMEO: "Vimeo video" };

export function LessonForm({
  sectionId,
  lessonId,
  defaults,
  onDone,
}: {
  sectionId?: string;
  lessonId?: string;
  defaults?: LessonDefaults;
  onDone?: () => void;
}) {
  const action = lessonId ? updateLesson.bind(null, lessonId) : addLesson.bind(null, sectionId!);
  const { state, formAction, pending } = useForm(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok) onDone?.();
    return result;
  });
  const [kind, setKind] = useState<LessonDefaults["kind"]>(defaults?.kind ?? "PDF");
  const isFile = kind === "PDF" || kind === "VIDEO";

  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="grid gap-4 md:grid-cols-[1fr_12rem_8rem]">
        <FormField name="title" label="Lesson title">
          <Input name="title" required defaultValue={defaults?.title} maxLength={200} />
        </FormField>
        <FormField name="kind" label="Type">
          <select
            name="kind"
            className={selectClass}
            value={kind}
            onChange={(event) => setKind(event.target.value as LessonDefaults["kind"])}
          >
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField name="durationMins" label="Minutes">
          <Input
            name="durationMins"
            type="number"
            min={0}
            max={1000}
            inputMode="numeric"
            defaultValue={defaults?.durationMins ?? ""}
          />
        </FormField>
      </div>
      {isFile ? (
        <FileUpload
          key={kind}
          name="fileKey"
          kind={kind === "PDF" ? "pdf" : "video"}
          label={kind === "PDF" ? "PDF file" : "Video file"}
          defaultKey={defaults?.kind === kind ? defaults.fileKey : null}
        />
      ) : (
        <FormField
          name="url"
          label={kind === "YOUTUBE" ? "YouTube link" : "Vimeo link"}
          hint={kind === "VIMEO" ? "For unlisted videos, paste the full link including the part after the number." : undefined}
        >
          <Input
            name="url"
            type="url"
            required
            defaultValue={defaults?.kind === kind ? (defaults.url ?? "") : ""}
            placeholder={kind === "YOUTUBE" ? "https://www.youtube.com/watch?v=…" : "https://vimeo.com/123456789"}
          />
        </FormField>
      )}
      <NotesEditor name="notes" label="Notes" defaultValue={defaults?.notes ?? ""} />
      <FormMessage error={state.error} />
      <Saved state={state} />
      <div className="flex gap-2">
        <Submit pending={pending}>{lessonId ? "Save lesson" : "Add lesson"}</Submit>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </ValidatedForm>
  );
}

/** "Add lesson" / "Edit" toggles that open the lesson form in place. */
export function LessonEditor({
  sectionId,
  lessonId,
  defaults,
  label,
}: {
  sectionId?: string;
  lessonId?: string;
  defaults?: LessonDefaults;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  if (!open)
    return (
      <Button type="button" variant={lessonId ? "ghost" : "outline"} size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  return (
    <div className="w-full">
      <LessonForm
        key={round}
        sectionId={sectionId}
        lessonId={lessonId}
        defaults={defaults}
        onDone={() => {
          setOpen(false);
          setRound((value) => value + 1);
        }}
      />
    </div>
  );
}

// --- FAQs --------------------------------------------------------------------

export function FaqForm({
  courseId,
  faqId,
  defaults,
}: {
  courseId?: string;
  faqId?: string;
  defaults?: { question: string; answer: string };
}) {
  const [round, setRound] = useState(0);
  const action = faqId ? updateFaq.bind(null, faqId) : addFaq.bind(null, courseId!);
  const { state, formAction, pending } = useForm(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok === true) setRound((value) => value + 1);
    return result;
  });
  return (
    <ValidatedForm key={round} action={formAction} fieldErrors={state.fieldErrors} className="flex flex-col gap-3">
      <FormField name="question" label="Question">
        <Input name="question" required defaultValue={defaults?.question} maxLength={500} />
      </FormField>
      <FormField name="answer" label="Answer">
        <Textarea name="answer" required rows={3} defaultValue={defaults?.answer} maxLength={5000} />
      </FormField>
      <FormMessage error={state.error} />
      <Saved state={state} />
      <div>
        <Submit pending={pending}>{faqId ? "Save FAQ" : "Add FAQ"}</Submit>
      </div>
    </ValidatedForm>
  );
}

// --- Assignments -------------------------------------------------------------

export function AssignmentForm({
  courseId,
  departments,
  employees,
}: {
  courseId: string;
  departments: string[];
  employees: Employee[];
}) {
  const [round, setRound] = useState(0);
  const action = addAssignment.bind(null, courseId);
  const { state, formAction, pending } = useForm(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok) setRound((value) => value + 1);
    return result;
  });
  const [target, setTarget] = useState<"ALL" | "DEPARTMENT" | "USER">("DEPARTMENT");
  const [employeeId, setEmployeeId] = useState("");

  return (
    <ValidatedForm
      key={round}
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end"
    >
      <FormField name="target" label="Assign to">
        <select
          name="target"
          className={`${selectClass} md:w-40`}
          value={target}
          onChange={(event) => setTarget(event.target.value as typeof target)}
        >
          <option value="DEPARTMENT">A department</option>
          <option value="USER">One person</option>
          <option value="ALL">Everyone</option>
        </select>
      </FormField>
      {target === "DEPARTMENT" && (
        <FormField name="department" label="Department">
          <select name="department" required className={`${selectClass} md:w-56`} defaultValue="">
            <option value="" disabled>
              Pick a department
            </option>
            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </FormField>
      )}
      {target === "USER" && (
        <FormField name="employeeId" label="Person" htmlFor="assign-person-desktop" className="md:w-72">
          <EmployeeSelect
            id="assign-person"
            name="employeeId"
            employees={employees}
            selectedId={employeeId}
            onSelect={setEmployeeId}
          />
        </FormField>
      )}
      <FormField name="dueDate" label="Due (optional)">
        <Input name="dueDate" type="date" className="md:w-44" />
      </FormField>
      <Submit pending={pending}>Assign</Submit>
      <FormMessage error={state.error} />
    </ValidatedForm>
  );
}

// --- Live classes ------------------------------------------------------------

export function LiveClassForm({ courseId }: { courseId: string }) {
  const [round, setRound] = useState(0);
  const action = addLiveClass.bind(null, courseId);
  const { state, formAction, pending } = useForm(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok) setRound((value) => value + 1);
    return result;
  });
  return (
    <ValidatedForm key={round} action={formAction} fieldErrors={state.fieldErrors} className="grid gap-3 md:grid-cols-2">
      <FormField name="title" label="Title" className="md:col-span-2">
        <Input name="title" required maxLength={200} placeholder="e.g. Live lecture — Prompting basics" />
      </FormField>
      <FormField name="startsAt" label="Starts (IST)">
        <Input name="startsAt" type="datetime-local" required />
      </FormField>
      <FormField name="endsAt" label="Ends (IST)">
        <Input name="endsAt" type="datetime-local" required />
      </FormField>
      <FormField name="trainer" label="Trainer">
        <Input name="trainer" />
      </FormField>
      <FormField name="meetingUrl" label="Meeting link">
        <Input name="meetingUrl" type="url" placeholder="https://meet.google.com/…" />
      </FormField>
      <FormField name="recordingUrl" label="Recording link (after the class)" className="md:col-span-2">
        <Input name="recordingUrl" type="url" />
      </FormField>
      <FormMessage error={state.error} />
      <div>
        <Submit pending={pending}>Add live class</Submit>
      </div>
    </ValidatedForm>
  );
}
