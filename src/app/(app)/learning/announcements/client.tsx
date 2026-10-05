"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import { NotesEditor } from "../_components/notes-editor";
import { createAnnouncement, markAnnouncementsRead } from "../actions";

/** Marks what's on screen as read once it has been shown. */
export function MarkRead({ ids }: { ids: string[] }) {
  const key = ids.join(",");
  useEffect(() => {
    if (key) void markAnnouncementsRead(key.split(","));
  }, [key]);
  return null;
}

/** Submits the filter form whenever one of its checkboxes changes. */
export function AutoSubmit({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    // Inputs join the form with form="…", so listen on the document.
    const submit = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (input.form === form && input.type === "checkbox") form.requestSubmit();
    };
    document.addEventListener("change", submit);
    return () => document.removeEventListener("change", submit);
  }, [formId]);
  return null;
}

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

export function NewAnnouncementForm({ courses }: { courses: { id: string; title: string }[] }) {
  const [round, setRound] = useState(0);
  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof createAnnouncement>>, formData: FormData) => {
    const result = await createAnnouncement(prev, formData);
    if (result.ok) setRound((value) => value + 1);
    return result;
  }, {});
  return (
    <ValidatedForm key={round} action={formAction} fieldErrors={state.fieldErrors} className="flex flex-col gap-3">
      <FormField name="title" label="Title">
        <Input name="title" required maxLength={200} />
      </FormField>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField name="urgency" label="Urgency">
          <select name="urgency" className={selectClass} defaultValue="NONE">
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
            <option value="NONE">Not set</option>
          </select>
        </FormField>
        <FormField name="courseId" label="For">
          <select name="courseId" className={selectClass} defaultValue="">
            <option value="">Everyone</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <NotesEditor name="body" label="Message" />
      <FormMessage error={state.error} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Posting…" : "Post announcement"}
        </Button>
      </div>
    </ValidatedForm>
  );
}
