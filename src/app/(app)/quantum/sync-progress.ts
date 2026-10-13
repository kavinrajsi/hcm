// Quantum Sheet: turns the sync's streamed events into the progress list
// the Sync button shows (kept apart from the component so it can be tested).

import type { QuantumSyncEvent } from "@/app/api/quantum/sync/route";

export const STEPS = [
  { stage: "todos", label: "To-dos (every To-dos list)" },
  { stage: "cards", label: "Card Table cards" },
  { stage: "steps", label: "Steps on to-dos and cards" },
  { stage: "hours", label: "Basecamp timesheet hours" },
] as const;
export type Stage = (typeof STEPS)[number]["stage"];

export type StepState = { status: "waiting" | "running" | "done"; detail?: string };
export type SyncState = {
  running: boolean;
  steps: Record<Stage, StepState>;
  result?: string;
  error?: string;
};

export const idleSteps = (): Record<Stage, StepState> =>
  Object.fromEntries(STEPS.map((step) => [step.stage, { status: "waiting" }])) as Record<
    Stage,
    StepState
  >;

const STATUS_LABELS = { active: "Active", archived: "Archived", trashed: "Trash" } as const;

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** Applies one streamed event: the step it names runs, earlier steps are done. */
export function applySyncEvent(state: SyncState, event: QuantumSyncEvent): SyncState {
  if (event.type === "error") return { ...state, running: false, error: event.message };
  const steps = { ...state.steps };
  if (event.type === "done") {
    for (const step of STEPS)
      if (steps[step.stage].status !== "waiting") steps[step.stage] = { ...steps[step.stage], status: "done" };
    const parts = [
      event.saved === 0 ? "No to-dos changed" : `Updated ${plural(event.saved, "to-do")}`,
      `${plural(event.hourEntries, "timesheet entry", "timesheet entries")} checked`,
    ];
    return { ...state, running: false, steps, result: `${parts.join(" · ")}.` };
  }
  const index = STEPS.findIndex((step) => step.stage === event.stage);
  STEPS.slice(0, index).forEach((step) => {
    steps[step.stage] = { ...steps[step.stage], status: "done" };
  });
  const detail =
    event.stage === "hours"
      ? event.hourEntries === null
        ? "Reading the timesheet…"
        : `${plural(event.hourEntries, "entry", "entries")} on to-dos`
      : `${STATUS_LABELS[event.status]} · ${plural(event.pages, "page")} checked · ${event.saved} changed`;
  steps[event.stage] = { status: "running", detail };
  return { ...state, steps };
}
