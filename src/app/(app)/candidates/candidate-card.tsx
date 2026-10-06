"use client";

import { useState } from "react";
import { ListCard } from "@/components/list-card";
import { cn } from "@/lib/utils";
import { CandidateDialog, type CandidateDetail } from "./candidate-dialog";
import { CANDIDATE_STATUS_CLASSES, type CandidateStatus } from "./statuses";
import { formatDay } from "@/lib/format-date";
import { ScoreBadge } from "./score-badge";

/** Phone list row; tapping opens the same details drawer as "View". */
export function CandidateCard({ candidate }: { candidate: CandidateDetail }) {
  const [open, setOpen] = useState(false);
  const status = candidate.status as CandidateStatus;
  return (
    <>
      <ListCard
        onSelect={() => setOpen(true)}
        title={candidate.name}
        subtitle={candidate.jobRole}
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
            {candidate.position && <span>{candidate.position}</span>}
            <span className="tabular-nums">
              {formatDay(candidate.appliedOn)}
            </span>
            {candidate.resumeHref && <span>Resume</span>}
            {candidate.score?.value != null && (
              <span className="inline-flex items-center gap-1">
                Score <ScoreBadge score={candidate.score} />
              </span>
            )}
          </>
        }
      />
      <CandidateDialog
        candidate={candidate}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
