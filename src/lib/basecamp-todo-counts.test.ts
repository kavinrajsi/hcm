import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
const { countOpenTodos, sortOpenTodos } = await import("./basecamp-todo-counts");

const todo = (id: number, due_on: string | null, completed = false) => ({
  id,
  title: `To-do ${id}`,
  app_url: `https://3.basecamp.com/todos/${id}`,
  due_on,
  completed,
  bucket: { name: "Brand" },
});

describe("countOpenTodos", () => {
  const today = "2026-10-07";

  it("splits open to-dos by due date and counts the overdue ones", () => {
    expect(
      countOpenTodos(
        [
          todo(1, "2026-10-09"),
          todo(2, "2026-10-06"),
          todo(3, "2026-10-07"),
          todo(4, null),
          todo(5, null),
        ],
        today,
      ),
    ).toEqual({ dated: 3, undated: 2, overdue: 1 });
  });

  it("ignores completed ones", () => {
    expect(
      countOpenTodos([todo(1, "2026-10-01", true), todo(2, null, true)], today),
    ).toEqual({ dated: 0, undated: 0, overdue: 0 });
  });
});

describe("sortOpenTodos", () => {
  it("puts the soonest due first and undated last, dropping completed", () => {
    const sorted = sortOpenTodos([
      todo(1, null),
      todo(2, "2026-10-20"),
      todo(3, "2026-10-01"),
      todo(4, "2026-10-05", true),
    ]);
    expect(sorted.map((item) => item.id)).toEqual([3, 2, 1]);
    expect(sorted[0]).toEqual({
      id: 3,
      title: "To-do 3",
      url: "https://3.basecamp.com/todos/3",
      project: "Brand",
      dueOn: "2026-10-01",
    });
  });
});
