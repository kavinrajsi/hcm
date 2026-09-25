"use client";

import { useActionState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  addCandidateNote,
  deleteCandidateNote,
  updateCandidate,
  type CandidateFormState,
} from "./actions";
import {
  AddIcon,
  ArrowOutwardIcon,
  CallIcon,
  CheckIcon,
  DeleteIcon,
  DescriptionIcon,
  FileOpenIcon,
  FlagIcon,
  InputIcon,
  LanguageIcon,
  LinkIcon,
  LocationOnIcon,
  MailIcon,
  StickyNoteIcon,
} from "@/components/icons";
import type { CandidateNote } from "./notes";
import { StatusHistory } from "./status-history";
import { CANDIDATE_STATUSES } from "./statuses";

export type CandidateDetail = {
  id: string;
  name: string;
  email: string | null;
  mobileNumber: string | null;
  position: string | null;
  jobRole: string | null;
  location: string | null;
  portfolio: string | null;
  resumeHref: string | null;
  status: string;
  notes: (CandidateNote & { when: string | null })[];
  appliedOn: string;
  pageUrl: string | null;
  addedManually: boolean;
  referrer: string | null;
};

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
      <dd className="min-w-0 break-words">{children || "—"}</dd>
    </>
  );
}

/**
 * Portfolio is free text from the career form — sometimes several URLs or a
 * URL plus a sentence. Link each http(s) URL; everything else stays text.
 */
function Linkified({ text }: { text: string }) {
  return text.split(/(https?:\/\/[^\s,]+)/i).map((part, i) => {
    if (i % 2 === 0) return part;
    // Don't swallow sentence punctuation that follows a URL.
    const url = part.replace(/[.)\]]+$/, "");
    return (
      <span key={i}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="underline underline-offset-4"
        >
          {url.replace(/^https?:\/\//i, "")}
        </a>
        {part.slice(url.length)}
      </span>
    );
  });
}

/** Browsers can render PDFs inline; other types (doc/docx) only download. */
function isPdf(href: string): boolean {
  return /\.pdf$/i.test(href.split("?")[0]);
}

function NotesLog({
  candidateId,
  notes,
}: {
  candidateId: string;
  notes: CandidateDetail["notes"];
}) {
  const [state, formAction, pending] = useActionState<
    CandidateFormState,
    FormData
  >(addCandidateNote, {});
  const [deleting, startDelete] = useTransition();

  return (
    <section className="mt-8 text-sm">
      <h3 className="flex items-center gap-1.5 font-medium">
        <StickyNoteIcon className="size-4 text-zinc-500" />
        Notes
      </h3>
      {/* Remount after a note lands so the textarea clears. */}
      <form
        key={notes.length}
        action={formAction}
        className="mt-2 flex flex-col gap-2"
      >
        <input type="hidden" name="id" value={candidateId} />
        <Textarea name="text" rows={2} placeholder="Add a note…" required />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            <AddIcon className="size-4" />
            {pending ? "Adding…" : "Add note"}
          </Button>
          {state.error && <p className="text-red-600">{state.error}</p>}
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="mt-4 text-zinc-500">No notes yet.</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="group rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between gap-2">
                <time
                  dateTime={n.timestamp ?? undefined}
                  className="text-xs text-zinc-500"
                >
                  {n.when ?? "Undated"}
                </time>
                <button
                  type="button"
                  aria-label="Delete note"
                  disabled={deleting}
                  onClick={() => {
                    if (!window.confirm("Delete this note?")) return;
                    startDelete(() => deleteCandidateNote(candidateId, n.id));
                  }}
                  className="-m-2 p-2 text-zinc-400 transition-opacity hover:text-red-600 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                >
                  <DeleteIcon className="size-4" />
                </button>
              </div>
              <p className="mt-1 whitespace-pre-line">{n.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Candidate details drawer. Uncontrolled with its own "View" trigger (list
 * view), or controlled via `open`/`onOpenChange` with no trigger (board).
 */
export function CandidateDialog({
  candidate,
  open,
  onOpenChange,
}: {
  candidate: CandidateDetail;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState<
    CandidateFormState,
    FormData
  >(updateCandidate, {});
  const selectClass =
    "h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {open === undefined && (
        <SheetTrigger className="inline-flex cursor-pointer items-center gap-1 text-xs text-zinc-400 hover:text-foreground">
          <ArrowOutwardIcon className="size-4" />
          View
        </SheetTrigger>
      )}
      <SheetContent side="right" className="w-full data-[side=right]:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{candidate.name}</SheetTitle>
          <SheetDescription>
            {candidate.jobRole ?? "—"} · {candidate.position ?? "—"} · applied{" "}
            {candidate.appliedOn}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <Row icon={MailIcon} label="Email">
              {candidate.email && (
                <a
                  href={`mailto:${candidate.email}`}
                  className="underline underline-offset-4"
                >
                  {candidate.email}
                </a>
              )}
            </Row>
            <Row icon={CallIcon} label="Mobile">
              {candidate.mobileNumber && (
                <a
                  href={`tel:${candidate.mobileNumber}`}
                  className="underline underline-offset-4"
                >
                  {candidate.mobileNumber}
                </a>
              )}
            </Row>
            <Row icon={LocationOnIcon} label="Location">{candidate.location}</Row>
            <Row icon={DescriptionIcon} label="Resume">
              {candidate.resumeHref &&
                // PDFs preview in a new tab; other formats can only download.
                (isPdf(candidate.resumeHref) ? (
                  <a
                    href={`${candidate.resumeHref}?inline=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    <FileOpenIcon className="size-4" />
                    Preview resume
                  </a>
                ) : (
                  <a
                    href={candidate.resumeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    Download
                  </a>
                ))}
            </Row>
            <Row icon={LinkIcon} label="Portfolio">
              {candidate.portfolio && (
                <Linkified text={candidate.portfolio} />
              )}
            </Row>
            <Row icon={LanguageIcon} label="Applied from">
              {candidate.addedManually ? "Added in HCM" : candidate.pageUrl}
            </Row>
            <Row icon={InputIcon} label="Referrer">{candidate.referrer}</Row>
          </dl>

          <form
            action={formAction}
            className="mt-6 flex flex-col gap-3 text-sm"
          >
            <input type="hidden" name="id" value={candidate.id} />
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5">
                <FlagIcon className="size-4 text-zinc-500" />
                Status
              </span>
              <select
                name="status"
                defaultValue={candidate.status}
                className={selectClass}
              >
                {CANDIDATE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                <CheckIcon className="size-4" />
                {pending ? "Saving…" : "Save"}
              </Button>
              {state.error && <p className="text-red-600">{state.error}</p>}
              {state.ok && (
                <p className="text-emerald-600 dark:text-emerald-400">Saved.</p>
              )}
            </div>
          </form>

          <NotesLog candidateId={candidate.id} notes={candidate.notes} />

          {/* Re-keyed on status so a save/move reloads the log. */}
          <StatusHistory
            key={candidate.status}
            candidateId={candidate.id}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
