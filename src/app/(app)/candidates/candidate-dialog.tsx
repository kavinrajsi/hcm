"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
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

/** Drawer opened from inside the candidate modal (nested Base UI dialog). */
function ResumeDrawer({ name, href }: { name: string; href: string }) {
  const isPdf = /\.pdf$/i.test(href.split("?")[0]);
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        Preview resume
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{name} — resume</SheetTitle>
          <SheetDescription>
            {isPdf
              ? "PDF preview."
              : "Preview isn't available for this file type."}
          </SheetDescription>
        </SheetHeader>
        {isPdf ? (
          <iframe
            src={`${href}?inline=1`}
            title={`${name} resume`}
            className="mx-4 mb-4 min-h-0 flex-1 rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
          />
        ) : (
          <p className="px-4 text-sm">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Download the file
            </a>{" "}
            to view it.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function CandidateDialog({ candidate }: { candidate: CandidateDetail }) {
  const [state, formAction, pending] = useActionState<
    CandidateFormState,
    FormData
  >(updateCandidate, {});
  const selectClass =
    "h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

  return (
    <Sheet>
      <SheetTrigger className="text-xs text-zinc-400 hover:text-foreground">
        View
      </SheetTrigger>
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
                  <ResumeDrawer
                    name={candidate.name}
                    href={candidate.resumeHref}
                  />
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
