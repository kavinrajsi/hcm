"use client";

import { useActionState } from "react";
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
import { updateCandidate, type CandidateFormState } from "./actions";
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
  notes: string | null;
  appliedOn: string;
  pageUrl: string | null;
  referrer: string | null;
};

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words">{children || "—"}</dd>
    </>
  );
}

/** Browsers can render PDFs inline; other types (doc/docx) only download. */
function isPdf(href: string): boolean {
  return /\.pdf$/i.test(href.split("?")[0]);
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
        <SheetTrigger className="text-xs text-zinc-400 hover:text-foreground">
          View
        </SheetTrigger>
      )}
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{candidate.name}</SheetTitle>
          <SheetDescription>
            {candidate.jobRole ?? "—"} · {candidate.position ?? "—"} · applied{" "}
            {candidate.appliedOn}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <Row label="Email">
              {candidate.email && (
                <a
                  href={`mailto:${candidate.email}`}
                  className="underline underline-offset-4"
                >
                  {candidate.email}
                </a>
              )}
            </Row>
            <Row label="Mobile">
              {candidate.mobileNumber && (
                <a
                  href={`tel:${candidate.mobileNumber}`}
                  className="underline underline-offset-4"
                >
                  {candidate.mobileNumber}
                </a>
              )}
            </Row>
            <Row label="Location">{candidate.location}</Row>
            <Row label="Resume">
              {candidate.resumeHref && (
                <span className="flex flex-wrap items-center gap-3">
                  {isPdf(candidate.resumeHref) && (
                    <a
                      href={`${candidate.resumeHref}?inline=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      Preview resume
                    </a>
                  )}
                  <a
                    href={candidate.resumeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    Download
                  </a>
                </span>
              )}
            </Row>
            <Row label="Portfolio">
              {candidate.portfolio && (
                <a
                  href={candidate.portfolio}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline underline-offset-4"
                >
                  {candidate.portfolio.replace(/^https?:\/\//, "")}
                </a>
              )}
            </Row>
            <Row label="Applied from">{candidate.pageUrl}</Row>
            <Row label="Referrer">{candidate.referrer}</Row>
          </dl>

          <form
            action={formAction}
            className="mt-6 flex flex-col gap-3 text-sm"
          >
            <input type="hidden" name="id" value={candidate.id} />
            <label className="flex flex-col gap-1">
              Status
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
            <label className="flex flex-col gap-1">
              Notes
              <Textarea
                name="notes"
                defaultValue={candidate.notes ?? ""}
                rows={3}
              />
            </label>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
              {state.error && <p className="text-red-600">{state.error}</p>}
              {state.ok && (
                <p className="text-emerald-600 dark:text-emerald-400">Saved.</p>
              )}
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
