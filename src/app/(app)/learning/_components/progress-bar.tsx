import type { Progress } from "@/lib/learning/progress";

/** Thin progress bar with "17%" and "12/67 lessons" underneath. */
export function ProgressBar({ progress, compact = false }: { progress: Progress; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label="Course progress"
        className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      >
        <div
          className="h-full rounded-full bg-orange-600 transition-[width] dark:bg-orange-500"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      {!compact && (
        <div className="flex justify-between text-xs text-zinc-500">
          <span className="font-medium text-foreground">{progress.percent}%</span>
          <span>
            <span className="font-medium text-foreground">{progress.done}</span>/{progress.total} lessons
          </span>
        </div>
      )}
    </div>
  );
}
