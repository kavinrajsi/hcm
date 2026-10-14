// Quantum Sheet "Timesheet" view: hour entries grouped by project, like
// Basecamp's timesheet report — date, hours, who logged it, and the to-do
// with the entry's note. Uses the page's filters; the date range is the
// entry's date and "person" is who logged the hours.

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { effectiveMinutes } from "./todos";

export type TimesheetEntry = {
  id: string;
  date: Date;
  minutes: number;
  personId: string | null;
  personName: string;
  avatarKey: string | null;
  todoTitle: string;
  todoUrl: string;
  note: string | null;
  source: "basecamp" | "hcm";
};

export type TimesheetProject = {
  projectId: string;
  projectName: string;
  entries: TimesheetEntry[];
  totalMinutes: number;
};

export async function timesheet({
  todoWhere,
  dateRange,
  people,
  onlyPersonId,
  onlyEmployeeId,
}: {
  /** The page's to-do filters (project, type, status, search), without dates. */
  todoWhere: Prisma.QuantumTodoWhereInput;
  dateRange?: { gte?: Date; lt?: Date };
  /** Basecamp person ids (who logged the hours). */
  people: string[];
  /** Non-HR/manager viewers see only their own entries. */
  onlyPersonId?: string | null;
  onlyEmployeeId?: string | null;
}): Promise<{ projects: TimesheetProject[]; totalMinutes: number }> {
  const rows = await db.quantumHours.findMany({
    where: dateRange ? { date: dateRange } : undefined,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      todoBasecampId: true,
      source: true,
      minutes: true,
      date: true,
      personId: true,
      personName: true,
      note: true,
      employee: { select: { id: true, name: true, basecampPersonId: true, avatarBlobKey: true } },
    },
  });
  // A to-do with Basecamp hours counts those only (HCM entries would double
  // count), matching the to-do list's Hours column.
  const usesBasecamp = new Set(
    [...effectiveMinutes(rows)].filter(([, value]) => value.source === "basecamp").map(([id]) => id),
  );
  const counted = rows.filter((row) => row.source === "basecamp" || !usesBasecamp.has(row.todoBasecampId));

  const todos = await db.quantumTodo.findMany({
    where: { AND: [todoWhere, { basecampId: { in: [...new Set(counted.map((row) => row.todoBasecampId))] } }] },
    select: { basecampId: true, title: true, appUrl: true, projectId: true, projectName: true },
  });
  const todoById = new Map(todos.map((todo) => [todo.basecampId, todo]));

  const personIds = [...new Set(counted.flatMap((row) => (row.personId ? [row.personId] : [])))];
  const employees = personIds.length
    ? await db.employee.findMany({
        where: { basecampPersonId: { in: personIds } },
        select: { basecampPersonId: true, name: true, avatarBlobKey: true },
      })
    : [];
  const employeeByPerson = new Map(employees.map((employee) => [employee.basecampPersonId, employee]));

  const byProject = new Map<string, TimesheetProject>();
  for (const row of counted) {
    const todo = todoById.get(row.todoBasecampId);
    if (!todo) continue;
    const personId = row.personId ?? row.employee?.basecampPersonId ?? null;
    if (people.length && (!personId || !people.includes(personId))) continue;
    if (onlyPersonId !== undefined || onlyEmployeeId !== undefined) {
      const mine = (onlyPersonId && personId === onlyPersonId) || (onlyEmployeeId && row.employee?.id === onlyEmployeeId);
      if (!mine) continue;
    }
    const employee = personId ? employeeByPerson.get(personId) : undefined;
    const entry: TimesheetEntry = {
      id: row.id,
      date: row.date,
      minutes: row.minutes,
      personId,
      personName: employee?.name ?? row.employee?.name ?? row.personName ?? "Someone",
      avatarKey: employee?.avatarBlobKey ?? row.employee?.avatarBlobKey ?? null,
      todoTitle: todo.title,
      todoUrl: todo.appUrl,
      note: row.note,
      source: row.source === "basecamp" ? "basecamp" : "hcm",
    };
    const project = byProject.get(todo.projectId) ?? {
      projectId: todo.projectId,
      projectName: todo.projectName,
      entries: [],
      totalMinutes: 0,
    };
    project.entries.push(entry);
    project.totalMinutes += row.minutes;
    byProject.set(todo.projectId, project);
  }
  // Busiest projects first, like Basecamp's report.
  const projects = [...byProject.values()].sort(
    (left, right) => right.totalMinutes - left.totalMinutes || left.projectName.localeCompare(right.projectName),
  );
  return { projects, totalMinutes: projects.reduce((sum, project) => sum + project.totalMinutes, 0) };
}

/** Hours as Basecamp's report writes them: 0.3, 1, 1.5, 6.2. */
export function decimalHours(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The view as a CSV (one row per entry), for "Download CSV". */
export function timesheetCsv(projects: TimesheetProject[], formatDate: (date: Date) => string): string {
  const rows = [["Date", "Project", "Hours", "Person", "To-do", "Note", "Link"]];
  for (const project of projects)
    for (const entry of project.entries)
      rows.push([
        formatDate(entry.date),
        project.projectName,
        decimalHours(entry.minutes),
        entry.personName,
        entry.todoTitle,
        entry.note ?? "",
        entry.todoUrl,
      ]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
