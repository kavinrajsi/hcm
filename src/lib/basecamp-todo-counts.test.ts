import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
const { countOpenTodos } = await import("./basecamp-todo-counts");

describe("countOpenTodos", () => {
  it("splits open to-dos by due date", () => {
    expect(
      countOpenTodos([
        { id: 1, due_on: "2026-10-09", completed: false },
        { id: 2, due_on: null, completed: false },
        { id: 3, due_on: null, completed: false },
      ]),
    ).toEqual({ dated: 1, undated: 2 });
  });

  it("ignores completed ones", () => {
    expect(
      countOpenTodos([
        { id: 1, due_on: "2026-10-09", completed: true },
        { id: 2, due_on: null, completed: true },
      ]),
    ).toEqual({ dated: 0, undated: 0 });
  });
});
