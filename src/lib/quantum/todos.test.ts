import { describe, expect, it } from "vitest";
import { rowStatus, statusWhere, toQuantumRow, type BasecampTodoRecording } from "./todos";

const base: BasecampTodoRecording = {
  id: 42,
  status: "active",
  title: "Homepage banner",
  app_url: "https://3.basecamp.com/1/buckets/7/todos/42",
  created_at: "2026-10-01T05:00:00.000Z",
  updated_at: "2026-10-12T20:00:00.000Z",
  completed: false,
  completion: null,
  due_on: "2026-10-15",
  starts_on: null,
  comments_count: 2,
  parent: { id: 9, title: "Design", type: "Todolist" },
  bucket: { id: 7, name: "Acme" },
  creator: { id: 1, name: "Asha" },
  assignees: [{ id: 5, name: "Ravi" }, { id: 6, name: "Meena" }],
};

describe("toQuantumRow", () => {
  it("files an open to-do under its due date", () => {
    const row = toQuantumRow(base);
    expect(row.sheetDay?.toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(row.completedAt).toBeNull();
    expect(row.assigneeIds).toEqual(["5", "6"]);
    expect(row.projectId).toBe("7");
    expect(row.listName).toBe("Design");
  });

  it("files a completed to-do under the IST day it was done", () => {
    // 20:00 UTC on the 12th is 01:30 IST on the 13th.
    const row = toQuantumRow({
      ...base,
      completed: true,
      completion: { created_at: "2026-10-12T20:00:00.000Z", creator: { id: 5, name: "Ravi" } },
    });
    expect(row.sheetDay?.toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(row.data.completion).toEqual({ at: "2026-10-12T20:00:00.000Z", by: { id: 5, name: "Ravi" } });
  });

  it("falls back to updated_at when completion is missing", () => {
    const row = toQuantumRow({ ...base, completed: true, completion: undefined });
    expect(row.completedAt?.toISOString()).toBe(base.updated_at);
  });

  it("leaves undated open to-dos without a day", () => {
    expect(toQuantumRow({ ...base, due_on: null }).sheetDay).toBeNull();
  });

  it("keeps only the trimmed fields in data", () => {
    const row = toQuantumRow({
      ...base,
      assignees: [{ id: 5, name: "Ravi", avatar_url: "x", email_address: "r@x" } as never],
    });
    expect(row.data.assignees).toEqual([{ id: 5, name: "Ravi" }]);
    expect(Object.keys(row.data)).not.toContain("description");
  });
});

describe("statusWhere", () => {
  it("is empty with no statuses", () => {
    expect(statusWhere([], "2026-10-13")).toBeUndefined();
  });

  it("ORs the ticked statuses; overdue is open and due before today", () => {
    expect(statusWhere(["completed", "overdue"], "2026-10-13")).toEqual({
      OR: [
        { completed: true },
        { completed: false, dueOn: { lt: new Date("2026-10-13T00:00:00Z") } },
      ],
    });
  });
});

describe("rowStatus", () => {
  const due = (day: string) => new Date(`${day}T00:00:00Z`);
  it("reads completed, overdue and open", () => {
    expect(rowStatus({ completed: true, dueOn: due("2026-01-01") }, "2026-10-13")).toBe("completed");
    expect(rowStatus({ completed: false, dueOn: due("2026-10-12") }, "2026-10-13")).toBe("overdue");
    expect(rowStatus({ completed: false, dueOn: due("2026-10-13") }, "2026-10-13")).toBe("open");
    expect(rowStatus({ completed: false, dueOn: null }, "2026-10-13")).toBe("open");
  });
});
