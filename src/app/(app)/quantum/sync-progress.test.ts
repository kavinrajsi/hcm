import { describe, expect, it } from "vitest";
import { applySyncEvent, idleSteps, type SyncState } from "./sync-progress";

const start = (): SyncState => ({ running: true, steps: idleSteps() });

describe("applySyncEvent", () => {
  it("runs the named step and finishes the ones before it", () => {
    let state = applySyncEvent(start(), { type: "progress", stage: "todos", status: "archived", pages: 2, saved: 3 });
    expect(state.steps.todos).toEqual({ status: "running", detail: "Archived · 2 pages checked · 3 changed" });
    state = applySyncEvent(state, { type: "progress", stage: "steps", status: "active", pages: 0, saved: 0 });
    expect(state.steps.todos.status).toBe("done");
    expect(state.steps.cards.status).toBe("done");
    expect(state.steps.steps).toEqual({ status: "running", detail: "Active · 0 pages checked · 0 changed" });
    expect(state.steps.hours.status).toBe("waiting");
  });

  it("shows the timesheet step and the final summary", () => {
    let state = applySyncEvent(start(), { type: "progress", stage: "hours", hourEntries: null });
    expect(state.steps.hours.detail).toBe("Reading the timesheet…");
    state = applySyncEvent(state, { type: "progress", stage: "hours", hourEntries: 1 });
    expect(state.steps.hours.detail).toBe("1 entry on to-dos");
    state = applySyncEvent(state, { type: "done", saved: 1, hourEntries: 176 });
    expect(state.running).toBe(false);
    expect(state.steps.hours.status).toBe("done");
    expect(state.result).toBe("Updated 1 to-do · 176 timesheet entries checked.");
  });

  it("says when nothing changed", () => {
    expect(applySyncEvent(start(), { type: "done", saved: 0, hourEntries: 0 }).result).toBe(
      "No to-dos changed · 0 timesheet entries checked.",
    );
  });

  it("stops on an error", () => {
    const state = applySyncEvent(start(), { type: "error", message: "No HR admin has connected Basecamp" });
    expect(state).toMatchObject({ running: false, error: "No HR admin has connected Basecamp" });
  });
});
