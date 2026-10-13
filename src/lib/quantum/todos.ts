// Quantum Sheet: turns a Basecamp to-do (from the account-wide recordings
// list) into a QuantumTodo row, and builds the page's status filter.

import type { Prisma } from "@/generated/prisma/client";
import { istDayKey } from "@/lib/format-date";

/** A to-do as `/projects/recordings.json?type=Todo` returns it (fields we use). */
export type BasecampTodoRecording = {
  id: number;
  status: string; // active | archived | trashed
  title: string;
  app_url: string;
  created_at: string;
  updated_at: string;
  completed: boolean;
  completion?: { created_at: string; creator?: { id: number; name: string } | null } | null;
  due_on: string | null;
  starts_on: string | null;
  comments_count?: number;
  parent: { id: number; title: string; type: string };
  bucket: { id: number; name: string };
  creator?: { id: number; name: string } | null;
  assignees: { id: number; name: string }[];
};

/** The trimmed copy kept in QuantumTodo.data (no descriptions or avatars). */
export type QuantumTodoData = {
  id: number;
  title: string;
  status: string;
  completed: boolean;
  completion: { at: string; by: { id: number; name: string } | null } | null;
  dueOn: string | null;
  startsOn: string | null;
  project: { id: number; name: string };
  list: { id: number; title: string } | null;
  assignees: { id: number; name: string }[];
  creator: { id: number; name: string } | null;
  commentsCount: number;
  url: string;
  createdAt: string;
  updatedAt: string;
};

const person = (value?: { id: number; name: string } | null) =>
  value ? { id: value.id, name: value.name } : null;

const utcDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** Row values for an upsert, keyed by the Basecamp id. */
export function toQuantumRow(todo: BasecampTodoRecording) {
  // Completing a to-do bumps updated_at, so it stands in when completion is missing.
  const completedAt = todo.completed
    ? new Date(todo.completion?.created_at ?? todo.updated_at)
    : null;
  // Completed to-dos sit under the IST day they were done; open ones under their due date.
  const sheetDay = completedAt ? istDayKey(completedAt) : todo.due_on;
  const list = todo.parent?.type === "Todolist" ? { id: todo.parent.id, title: todo.parent.title } : null;
  const data: QuantumTodoData = {
    id: todo.id,
    title: todo.title,
    status: todo.status,
    completed: todo.completed,
    completion: completedAt
      ? { at: completedAt.toISOString(), by: person(todo.completion?.creator) }
      : null,
    dueOn: todo.due_on,
    startsOn: todo.starts_on,
    project: { id: todo.bucket.id, name: todo.bucket.name },
    list,
    assignees: todo.assignees.map((assignee) => ({ id: assignee.id, name: assignee.name })),
    creator: person(todo.creator),
    commentsCount: todo.comments_count ?? 0,
    url: todo.app_url,
    createdAt: todo.created_at,
    updatedAt: todo.updated_at,
  };
  return {
    basecampId: String(todo.id),
    projectId: String(todo.bucket.id),
    projectName: todo.bucket.name,
    listName: list?.title ?? null,
    title: todo.title,
    status: todo.status,
    completed: todo.completed,
    completedAt,
    dueOn: todo.due_on ? utcDate(todo.due_on) : null,
    sheetDay: sheetDay ? utcDate(sheetDay) : null,
    assigneeIds: todo.assignees.map((assignee) => String(assignee.id)),
    appUrl: todo.app_url,
    basecampCreatedAt: new Date(todo.created_at),
    basecampUpdatedAt: new Date(todo.updated_at),
    data,
  };
}

export const QUANTUM_STATUSES = [
  { value: "completed", label: "Completed" },
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
] as const;
export type QuantumStatus = (typeof QUANTUM_STATUSES)[number]["value"];

/** OR of the ticked statuses; `today` is the IST "YYYY-MM-DD" (due today isn't overdue). */
export function statusWhere(
  statuses: QuantumStatus[],
  today: string,
): Prisma.QuantumTodoWhereInput | undefined {
  if (statuses.length === 0) return undefined;
  const clauses: Prisma.QuantumTodoWhereInput[] = statuses.map((status) =>
    status === "completed"
      ? { completed: true }
      : status === "open"
        ? { completed: false }
        : { completed: false, dueOn: { lt: utcDate(today) } },
  );
  return { OR: clauses };
}

/** How a row reads: Completed, Overdue or Open. */
export function rowStatus(
  todo: { completed: boolean; dueOn: Date | null },
  today: string,
): QuantumStatus {
  if (todo.completed) return "completed";
  return todo.dueOn && todo.dueOn < utcDate(today) ? "overdue" : "open";
}

/** A Basecamp Timesheet entry as `/reports/timesheet.json` returns it (fields we use). */
export type BasecampTimesheetEntry = {
  id: number;
  status: string;
  date: string; // YYYY-MM-DD
  hours: string; // "1.5"
  parent: { id: number; type: string };
  person?: { id: number; name: string } | null;
};

/** Hours as whole minutes ("0.3" → 18). */
export function hoursToMinutes(hours: string | number): number {
  const value = typeof hours === "number" ? hours : Number.parseFloat(hours);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 60) : 0;
}

/** "1.5h", "45m" — minutes as the Hours column shows them. */
export function formatHours(minutes: number): string {
  if (minutes <= 0) return "";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${hours}h`;
}

/**
 * Each to-do's hours: Basecamp Timesheet when anyone logged there, else the
 * hours people logged in HCM.
 */
export function effectiveMinutes(
  rows: { todoBasecampId: string; source: string; minutes: number }[],
): Map<string, { minutes: number; source: "basecamp" | "hcm" }> {
  const sums = new Map<string, { basecamp: number; hcm: number }>();
  for (const row of rows) {
    const sum = sums.get(row.todoBasecampId) ?? { basecamp: 0, hcm: 0 };
    if (row.source === "basecamp") sum.basecamp += row.minutes;
    else sum.hcm += row.minutes;
    sums.set(row.todoBasecampId, sum);
  }
  return new Map(
    [...sums].map(([id, sum]) => [
      id,
      sum.basecamp > 0
        ? { minutes: sum.basecamp, source: "basecamp" as const }
        : { minutes: sum.hcm, source: "hcm" as const },
    ]),
  );
}
