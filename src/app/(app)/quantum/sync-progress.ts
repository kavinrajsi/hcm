// Quantum Sheet: turns the sync's streamed events into the progress list
// the Sync button shows (kept apart from the component so it can be tested).

import type { QuantumSyncEvent } from "@/app/api/quantum/sync/route";

export const STEPS = [
  { stage: "todos", label: "To-dos" },
  { stage: "cards", label: "Cards" },
  { stage: "steps", label: "Steps" },
  { stage: "hours", label: "Timesheet hours" },
] as const;
export type Stage = (typeof STEPS)[number]["stage"];

type BasecampStatus = "active" | "archived" | "trashed";

export type StepState = {
  status: "waiting" | "running" | "done";
  pages: number;
  saved: number;
  /** Which Basecamp list the step is reading right now. */
  basecampStatus?: BasecampStatus;
  /** Timesheet step: null while reading, then the count. */
  hourEntries?: number | null;
};
export type SyncState = {
  running: boolean;
  steps: Record<Stage, StepState>;
  result?: string;
  error?: string;
};

export const idleSteps = (): Record<Stage, StepState> =>
  Object.fromEntries(STEPS.map((step) => [step.stage, { status: "waiting", pages: 0, saved: 0 }])) as Record<
    Stage,
    StepState
  >;

const STATUS_LABELS: Record<BasecampStatus, string> = { active: "Active", archived: "Archived", trashed: "Trash" };

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** The short text on a step's row: what it's reading now, or what it found. */
export function stepDetail(stage: Stage, step: StepState): string {
  if (step.status === "waiting") return "";
  if (stage === "hours") {
    if (step.hourEntries === null || step.hourEntries === undefined) return "Reading…";
    return plural(step.hourEntries, "entry", "entries");
  }
  if (step.status === "running") {
    if (!step.basecampStatus || step.pages === 0) return "Checking…";
    // Pages add up across the step's lists, so this is a running total.
    return `${STATUS_LABELS[step.basecampStatus]} · ${plural(step.pages, "page")}`;
  }
  return step.saved > 0 ? `${step.saved} updated` : "No changes";
}

/** Applies one streamed event: the step it names runs, earlier steps are done. */
export function applySyncEvent(state: SyncState, event: QuantumSyncEvent): SyncState {
  if (event.type === "error") return { ...state, running: false, error: event.message };
  const steps = { ...state.steps };
  if (event.type === "done") {
    for (const step of STEPS)
      if (steps[step.stage].status !== "waiting") steps[step.stage] = { ...steps[step.stage], status: "done" };
    const result = event.saved === 0 ? "Already up to date" : `Synced · ${plural(event.saved, "to-do")} updated`;
    return { ...state, running: false, steps, result };
  }
  const index = STEPS.findIndex((step) => step.stage === event.stage);
  STEPS.slice(0, index).forEach((step) => {
    steps[step.stage] = { ...steps[step.stage], status: "done" };
  });
  steps[event.stage] =
    event.stage === "hours"
      ? { ...steps.hours, status: "running", hourEntries: event.hourEntries }
      : {
          status: "running",
          pages: event.pages,
          saved: event.saved,
          basecampStatus: event.status,
        };
  return { ...state, steps };
}
