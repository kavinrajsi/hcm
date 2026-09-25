"use client";

import { useState } from "react";
import { ListCard } from "@/components/list-card";
import { cn } from "@/lib/utils";
import { CandidateDialog, type CandidateDetail } from "./candidate-dialog";
import { CANDIDATE_STATUS_CLASSES, type CandidateStatus } from "./statuses";

/** Phone list row; tapping opens the same details drawer as "View". */
export function CandidateCard({
  candidate: c,
}: {
  candidate: CandidateDetail;
}) {
  const [open, setOpen] = useState(false);
  const status = c.status as CandidateStatus;
  return (
    <>
      <ListCard
        onSelect={() => setOpen(true)}
        title={c.name}
        subtitle={c.jobRole}
        badge={
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-xs font-medium",
              CANDIDATE_STATUS_CLASSES[status],
            )}
          >
            {status}
          </span>
        }
        meta={
          <>
            {c.position && <span>{c.position}</span>}
            <span className="tabular-nums">{c.appliedOn}</span>
            {c.resumeHref && <span>Resume</span>}
          </>
        }
      />
      <CandidateDialog candidate={c} open={open} onOpenChange={setOpen} />
    </>
  );
}
