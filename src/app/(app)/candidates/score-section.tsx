"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format-date";
import { rescoreCandidate } from "./actions";
import type { CandidateDetail } from "./candidate-dialog";
import { ScoreBadge } from "./score-badge";

/** Drawer section: the AI resume score, why, and a Rescore button. */
export function ScoreSection({ candidate }: { candidate: CandidateDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const score = candidate.score;

  function rescore() {
    setMessage(undefined);
    startTransition(async () => {
      const outcome = await rescoreCandidate(candidate.id);
      setMessage(
        outcome === "SCORED"
          ? undefined
          : outcome === "NO_RESUME"
            ? "No PDF resume to score."
            : "Couldn't score it right now. Try again later.",
      );
      router.refresh();
    });
  }

  return (
    <section className="mt-8 text-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 font-medium">
          <Sparkles className="size-4 text-zinc-500" />
          Resume score
          {score?.value != null && <ScoreBadge score={score} className="ml-1" />}
        </h3>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={rescore}>
          <RefreshCw className={pending ? "animate-spin" : undefined} />
          {pending ? "Scoring…" : score ? "Rescore" : "Score now"}
        </Button>
      </div>

      {!score ? (
        <p className="mt-3 text-zinc-500">Not scored yet — new applications are scored within about 15 minutes.</p>
      ) : score.status !== "SCORED" ? (
        <p className="mt-3 text-zinc-500">
          {score.status === "NO_RESUME" ? score.summary || "No resume to score." : "The last attempt to score this resume failed."}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p>{score.summary}</p>
          {score.strengths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Strengths</p>
              <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-300">
                {score.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {score.gaps.length > 0 && (
            <div>
              <p className="text-xs font-medium text-rose-700 dark:text-rose-400">Gaps</p>
              <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-300">
                {score.gaps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-zinc-500">
            Scored {formatDateTime(new Date(score.scoredOn))} against {score.role ?? "the role"}
            {score.usedCriteria ? " using HR's criteria" : " — no role criteria written yet"}. AI-generated: a starting
            point, not a decision.
          </p>
        </div>
      )}
      {message && <p className="mt-2 text-rose-600 dark:text-rose-400">{message}</p>}
    </section>
  );
}
