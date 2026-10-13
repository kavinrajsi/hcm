import { describe, expect, it } from "vitest";
import { applySyncEvent, idleSteps, stepDetail, type SyncState } from "./sync-progress";

const start = (): SyncState => ({ running: true, steps: idleSteps() });

describe("applySyncEvent", () => {
  it("runs the named step and finishes the ones before it", () => {
    let state = applySyncEvent(start(), { type: "progress", stage: "todos", status: "archived", pages: 2, saved: 3 });
    expect(state.steps.todos.status).toBe("running");
    expect(stepDetail("todos", state.steps.todos)).toBe("Archived · 2 pages");
    state = applySyncEvent(state, { type: "progress", stage: "steps", status: "active", pages: 0, saved: 0 });
    expect(state.steps.todos.status).toBe("done");
    expect(state.steps.cards.status).toBe("done");
    expect(stepDetail("steps", state.steps.steps)).toBe("Checking…");
    expect(state.steps.hours.status).toBe("waiting");
    expect(stepDetail("hours", state.steps.hours)).toBe("");
  });

  it("shows what each finished step found, never the last list it read", () => {
    let state = applySyncEvent(start(), { type: "progress", stage: "todos", status: "trashed", pages: 5, saved: 18 });
    state = applySyncEvent(state, { type: "progress", stage: "cards", status: "trashed", pages: 3, saved: 0 });
    state = applySyncEvent(state, { type: "done", saved: 18, hourEntries: 177 });
    expect(stepDetail("todos", state.steps.todos)).toBe("18 updated");
    expect(stepDetail("cards", state.steps.cards)).toBe("No changes");
    expect(stepDetail("todos", state.steps.todos)).not.toContain("Trash");
  });

  it("shows the timesheet step and the final summary", () => {
    let state = applySyncEvent(start(), { type: "progress", stage: "hours", hourEntries: null });
    expect(stepDetail("hours", state.steps.hours)).toBe("Reading…");
    state = applySyncEvent(state, { type: "progress", stage: "hours", hourEntries: 1 });
    expect(stepDetail("hours", state.steps.hours)).toBe("1 entry");
    state = applySyncEvent(state, { type: "progress", stage: "hours", hourEntries: 177 });
    expect(stepDetail("hours", state.steps.hours)).toBe("177 entries");
    state = applySyncEvent(state, { type: "done", saved: 1, hourEntries: 177 });
    expect(state.running).toBe(false);
    expect(state.steps.hours.status).toBe("done");
    expect(state.result).toBe("Synced · 1 to-do updated");
  });

  it("says when nothing changed", () => {
    expect(applySyncEvent(start(), { type: "done", saved: 0, hourEntries: 0 }).result).toBe("Already up to date");
  });

  it("stops on an error", () => {
    const state = applySyncEvent(start(), { type: "error", message: "No HR admin has connected Basecamp" });
    expect(state).toMatchObject({ running: false, error: "No HR admin has connected Basecamp" });
  });
});
