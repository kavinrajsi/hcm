import { cn } from "@/lib/utils";
import { scoreBand } from "@/lib/candidates/score-bands";
import type { CandidateDetail } from "./candidate-dialog";

const BAND_CLASSES = {
  strong: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  fair: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  weak: "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200",
} as const;

/** The resume score as a coloured pill ("82"), or a quiet dash when there's none. */
export function ScoreBadge({ score, className }: { score: CandidateDetail["score"]; className?: string }) {
  const band = scoreBand(score?.value);
  if (!score || !band) {
    const text = !score ? "Not scored" : score.status === "NO_RESUME" ? "No resume" : "Couldn't score";
    return (
      <span title={text} className={cn("text-xs text-zinc-400", className)}>
        —
      </span>
    );
  }
  return (
    <span
      title={score.summary}
      className={cn("rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums", BAND_CLASSES[band], className)}
    >
      {score.value}
    </span>
  );
}
