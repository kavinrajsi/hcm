"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getCandidateHistory, type StatusChange } from "./actions";
import { CANDIDATE_STATUS_CLASSES, type CandidateStatus } from "./statuses";

function Chip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium",
        CANDIDATE_STATUS_CLASSES[status as CandidateStatus],
      )}
    >
      {status}
    </span>
  );
}

/**
 * Status moves for one candidate, newest first. Mounted inside the drawer,
 * so it loads when the drawer opens; the parent re-keys it on status change
 * to pick up the new entry.
 */
export function StatusHistory({ candidateId }: { candidateId: string }) {
  const [changes, setChanges] = useState<StatusChange[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCandidateHistory(candidateId).then(
      (rows) => !cancelled && setChanges(rows),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  return (
    <section className="mt-8 text-sm">
      <h3 className="font-medium">History</h3>
      {error ? (
        <p className="mt-2 text-red-600">Couldn&apos;t load history.</p>
      ) : changes === null ? (
        <p className="mt-2 text-zinc-500">Loading…</p>
      ) : changes.length === 0 ? (
        <p className="mt-2 text-zinc-500">No status changes yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3 border-l border-zinc-200 pl-4 dark:border-zinc-800">
          {changes.map((c) => (
            <li key={c.id} className="relative">
              <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <div className="flex flex-wrap items-center gap-1.5">
                {c.fromStatus ? (
                  <>
                    <Chip status={c.fromStatus} />
                    <span className="text-zinc-400">→</span>
                    <Chip status={c.toStatus} />
                  </>
                ) : (
                  <>
                    <span>Added as</span>
                    <Chip status={c.toStatus} />
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {c.when}
                {c.by && <> · by {c.by}</>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
