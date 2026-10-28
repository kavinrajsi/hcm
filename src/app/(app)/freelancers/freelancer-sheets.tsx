"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import { AddIcon, CallIcon, LinkIcon, MailIcon, StickyNoteIcon } from "@/components/icons";
import { NoteEditor } from "@/app/(app)/candidates/note-editor";
import type { CandidateNote } from "@/app/(app)/candidates/notes";
import { addFreelancer, addFreelancerNote, type FreelancerFormState } from "./actions";

const AVAILABILITY_OPTIONS = [
  ["AVAILABLE", "Available"],
  ["BUSY", "Busy"],
  ["UNAVAILABLE", "Unavailable"],
  ["UNKNOWN", "Unknown"],
] as const;

const badgeVariant = {
  AVAILABLE: "default",
  BUSY: "secondary",
  UNAVAILABLE: "destructive",
  UNKNOWN: "outline",
} as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

const requiredLabel = (text: string) => `${text} *`;

/** "Add candidate" button and the sheet with the required details. */
export function AddFreelancerSheet() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FreelancerFormState, FormData>(
    async (previous, formData) => {
      const result = await addFreelancer(previous, formData);
      if (result.ok) {
        setOpen(false);
        return {};
      }
      return result;
    },
    {},
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" />}>
        <AddIcon className="size-4" />
        Add candidate
      </SheetTrigger>
      <SheetContent side="right" className="w-full data-[side=right]:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add candidate</SheetTitle>
          <SheetDescription>Every field is required.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <ValidatedForm
            key={open ? "open" : "closed"}
            action={formAction}
            fieldErrors={state.fieldErrors}
            className="flex flex-col gap-3"
          >
            <FormField name="name" label={requiredLabel("Name")}>
              <Input id="fl-name" name="name" required />
            </FormField>
            <FormField name="phone" label={requiredLabel("Phone number")}>
              <Input name="phone" type="tel" required />
            </FormField>
            <FormField name="email" label={requiredLabel("Email ID")}>
              <Input name="email" type="email" required />
            </FormField>
            <FormField name="skillset" label={requiredLabel("Skill set")}>
              <Input name="skillset" required />
            </FormField>
            <FormField name="profileUrl" label={requiredLabel("Profile URL")}>
              <Input name="profileUrl" placeholder="behance.net/name" required />
            </FormField>
            <FormField name="rate" label={requiredLabel("Rate")}>
              <Input name="rate" placeholder="₹2500/day" required />
            </FormField>
            <FormField name="availability" label={requiredLabel("Status")}>
              <select name="availability" required defaultValue="" className={selectClass}>
                <option value="" disabled>
                  Pick a status
                </option>
                {AVAILABILITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField name="notes" label={requiredLabel("Note")}>
              <NoteEditor name="notes" placeholder="Add a note… (⌘↵ to submit)" />
            </FormField>
            <div className="flex flex-col gap-2 pt-1">
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add candidate"}
              </Button>
              <FormMessage error={state.error} />
            </div>
          </ValidatedForm>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type FreelancerDetail = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  skillset: string;
  profileUrl: string | null;
  rate: string | null;
  availability: keyof typeof badgeVariant;
  timeline: (CandidateNote & { when: string | null })[];
};

/** Details and timeline for one freelancer. Open state lives in the URL. */
export function FreelancerDetailSheet({
  freelancer,
  closeHref,
}: {
  freelancer: FreelancerDetail;
  closeHref: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FreelancerFormState, FormData>(
    addFreelancerNote,
    {},
  );

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) router.push(closeHref, { scroll: false });
      }}
    >
      <SheetContent side="right" className="w-full data-[side=right]:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{freelancer.name}</SheetTitle>
          <SheetDescription>{freelancer.skillset}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-sm">
          <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-2">
            <Row icon={CallIcon} label="Phone">
              {freelancer.phone ?? "—"}
            </Row>
            <Row icon={MailIcon} label="Email ID">
              {freelancer.email ? (
                <a href={`mailto:${freelancer.email}`} className="break-all underline underline-offset-4">
                  {freelancer.email}
                </a>
              ) : (
                "—"
              )}
            </Row>
            <Row icon={StickyNoteIcon} label="Skill set">
              {freelancer.skillset}
            </Row>
            <Row icon={LinkIcon} label="Profile URL">
              {freelancer.profileUrl ? (
                <a
                  href={freelancer.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all underline underline-offset-4"
                >
                  {freelancer.profileUrl}
                </a>
              ) : (
                "—"
              )}
            </Row>
            <Row icon={StickyNoteIcon} label="Rate">
              {freelancer.rate ?? "—"}
            </Row>
            <Row icon={StickyNoteIcon} label="Status">
              <Badge variant={badgeVariant[freelancer.availability]}>{freelancer.availability}</Badge>
            </Row>
          </dl>

          <section className="mt-8">
            <h3 className="font-medium">Timeline</h3>
            {/* Remount after a note lands so the editor clears. */}
            <ValidatedForm
              key={freelancer.timeline.length}
              action={formAction}
              fieldErrors={state.fieldErrors}
              className="mt-2 flex flex-col gap-2"
            >
              <input type="hidden" name="id" value={freelancer.id} />
              <FormField name="text">
                <NoteEditor name="text" placeholder="Add a note… (⌘↵ to submit)" />
              </FormField>
              <div className="flex items-center gap-3">
                <Button type="submit" size="sm" disabled={pending}>
                  <AddIcon className="size-4" />
                  {pending ? "Adding…" : "Add Note"}
                </Button>
                <FormMessage error={state.error} />
              </div>
            </ValidatedForm>

            {freelancer.timeline.length === 0 ? (
              <p className="mt-4 text-zinc-500">No notes yet — add one above.</p>
            ) : (
              <ol className="mt-4 flex flex-col gap-3">
                {freelancer.timeline.map((note) => (
                  <li key={note.id} className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                    <time dateTime={note.timestamp ?? undefined} className="text-xs text-zinc-500">
                      {note.when ?? "Undated"}
                    </time>
                    <div
                      className="mt-1 whitespace-pre-line [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 dark:[&_code]:bg-zinc-800 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
                      dangerouslySetInnerHTML={{ __html: note.text }}
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="flex items-center gap-1.5 text-zinc-500">
        <Icon className="size-4 shrink-0" />
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
