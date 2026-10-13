import { Fragment } from "react";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import {
  listParam,
  parseTableParams,
  stringParam,
} from "@/lib/table-params";
import { dayRange, istDay } from "@/lib/date-filter";
import {
  FilterDateRange,
  FilterMultiSelect,
  FilterSearch,
} from "@/components/data-table/filter-bar";
import { TablePagination } from "@/components/data-table/pagination";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ListCard } from "@/components/list-card";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { ArrowOutwardIcon } from "@/components/icons";
import { Prisma } from "@/generated/prisma/client";
import { formatDateTime, formatDay, formatWeekdayDay } from "@/lib/format-date";
import {
  QUANTUM_STATUSES,
  rowStatus,
  statusWhere,
  type QuantumStatus,
  type QuantumTodoData,
} from "@/lib/quantum/todos";
import { lastQuantumSync } from "@/lib/quantum/sync";
import { cn } from "@/lib/utils";
import { QuantumSyncForm } from "./sync-form";

// Quantum Sheet: Basecamp to-dos laid out like Basecamp's timesheet report —
// one block per day (completed date, else due date), read from the local
// copy in QuantumTodo so filtering never calls Basecamp.

export const metadata = { title: "Quantum Sheet" };

const STATUS_STYLES: Record<QuantumStatus, string> = {
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  open: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  overdue: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};
const STATUS_LABELS = Object.fromEntries(
  QUANTUM_STATUSES.map((status) => [status.value, status.label]),
) as Record<QuantumStatus, string>;

type Person = { id: string; name: string; avatarKey: string | null };

export default async function QuantumPage({ searchParams }: PageProps<"/quantum">) {
  await requirePageRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);
  const today = istDay();

  const projects = listParam(raw.project);
  const people = listParam(raw.person);
  const statusParam = listParam(raw.status);
  const statuses = QUANTUM_STATUSES.map((status) => status.value).filter((value) =>
    statusParam.includes(value),
  );
  const days = dayRange({
    preset: stringParam(raw.day),
    from: stringParam(raw.from),
    to: stringParam(raw.to),
  });

  // Trashed to-dos stay in the table (so the sync can tell) but never show.
  const visible: Prisma.QuantumTodoWhereInput = { status: { not: "trashed" } };
  const and: Prisma.QuantumTodoWhereInput[] = [visible];
  if (params.q)
    and.push({
      OR: [
        { title: { contains: params.q, mode: "insensitive" } },
        { projectName: { contains: params.q, mode: "insensitive" } },
        { listName: { contains: params.q, mode: "insensitive" } },
      ],
    });
  if (projects.length) and.push({ projectId: { in: projects } });
  if (people.length) and.push({ assigneeIds: { hasSome: people } });
  const byStatus = statusWhere(statuses, today);
  if (byStatus) and.push(byStatus);
  if (days) and.push({ sheetDay: days });
  const where: Prisma.QuantumTodoWhereInput = { AND: and };

  // People options follow the project filter: only who works on those projects.
  const projectSql = projects.length
    ? Prisma.sql`AND "projectId" IN (${Prisma.join(projects)})`
    : Prisma.empty;
  const [todos, total, projectGroups, assigneeRows, lastSync] = await Promise.all([
    db.quantumTodo.findMany({
      where,
      orderBy: [
        { sheetDay: { sort: "desc", nulls: "last" } },
        { completedAt: { sort: "desc", nulls: "last" } },
        { basecampUpdatedAt: "desc" },
      ],
      skip: params.skip,
      take: params.take,
    }),
    db.quantumTodo.count({ where }),
    db.quantumTodo.groupBy({
      by: ["projectId", "projectName"],
      where: visible,
      _count: true,
    }),
    db.$queryRaw<{ id: string; name: string; count: number }[]>`
      SELECT assignee->>'id' AS id, MAX(assignee->>'name') AS name, COUNT(*)::int AS count
      FROM "QuantumTodo", jsonb_array_elements("data"->'assignees') AS assignee
      WHERE "status" <> 'trashed' ${projectSql}
      GROUP BY assignee->>'id'`,
    lastQuantumSync(),
  ]);

  // Basecamp people who are employees get their HCM name and photo.
  const employees = await db.employee.findMany({
    where: { basecampPersonId: { in: assigneeRows.map((row) => row.id) } },
    select: { basecampPersonId: true, name: true, avatarBlobKey: true },
  });
  const employeeByPerson = new Map(employees.map((employee) => [employee.basecampPersonId, employee]));
  const personById = new Map<string, Person>(
    assigneeRows.map((row) => {
      const employee = employeeByPerson.get(row.id);
      return [
        row.id,
        { id: row.id, name: employee?.name ?? row.name, avatarKey: employee?.avatarBlobKey ?? null },
      ];
    }),
  );
  const assigneesOf = (data: QuantumTodoData): Person[] =>
    data.assignees.map(
      (assignee) =>
        personById.get(String(assignee.id)) ?? {
          id: String(assignee.id),
          name: assignee.name,
          avatarKey: null,
        },
    );

  // Consecutive rows of the same day form one block, as in the timesheet.
  const groups: { key: string; day: Date | null; rows: typeof todos }[] = [];
  for (const todo of todos) {
    const key = todo.sheetDay?.toISOString().slice(0, 10) ?? "none";
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(todo);
    else groups.push({ key, day: todo.sheetDay, rows: [todo] });
  }
  // Day totals cover the whole day, not just the rows on this page.
  const pageDays = groups.flatMap((group) => (group.day ? [group.day] : []));
  const [dayGroups, undatedGroups] = await Promise.all([
    pageDays.length
      ? db.quantumTodo.groupBy({
          by: ["sheetDay", "completed"],
          where: { AND: [...and, { sheetDay: { in: pageDays } }] },
          _count: true,
        })
      : [],
    groups.some((group) => !group.day)
      ? db.quantumTodo.groupBy({
          by: ["completed"],
          where: { AND: [...and, { sheetDay: null }] },
          _count: true,
        })
      : [],
  ]);
  const totals = new Map<string, { total: number; done: number }>();
  const addTotal = (key: string, completed: boolean, count: number) => {
    const entry = totals.get(key) ?? { total: 0, done: 0 };
    entry.total += count;
    if (completed) entry.done += count;
    totals.set(key, entry);
  };
  for (const row of dayGroups)
    if (row.sheetDay) addTotal(row.sheetDay.toISOString().slice(0, 10), row.completed, row._count);
  for (const row of undatedGroups) addTotal("none", row.completed, row._count);

  const dayLabel = (group: (typeof groups)[number]) =>
    group.day ? formatWeekdayDay(group.day) : "No due date";
  const dayCount = (group: (typeof groups)[number]) => {
    const { total: count, done } = totals.get(group.key) ?? { total: group.rows.length, done: 0 };
    return `${count} to-do${count === 1 ? "" : "s"}${done ? ` · ${done} completed` : ""}`;
  };

  return (
    <PageShell>
      <PageHeader
        title="Quantum Sheet"
        description={
          lastSync
            ? `Basecamp to-dos from the last 12 months. Last synced ${formatDateTime(lastSync)}.`
            : "Basecamp to-dos from the last 12 months. Not loaded from Basecamp yet."
        }
        actions={<QuantumSyncForm />}
      />

      <div className="mt-5 flex flex-col gap-3 md:mt-6">
        <FilterSearch placeholder="Search to-do, project or list" />
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:items-center [&>*]:md:min-w-0 [&>*]:md:flex-1">
          <FilterMultiSelect
            param="project"
            label="Project"
            plural="Projects"
            options={projectGroups
              .map((group) => ({ value: group.projectId, label: group.projectName, count: group._count }))
              .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))}
            searchable
          />
          <FilterMultiSelect
            param="person"
            label="Person"
            plural="People"
            options={[...personById.values()]
              .map((person) => ({
                value: person.id,
                label: person.name,
                count: assigneeRows.find((row) => row.id === person.id)?.count ?? 0,
              }))
              .sort((left, right) => left.label.localeCompare(right.label))}
            searchable
          />
          <FilterMultiSelect
            param="status"
            label="Status"
            plural="Statuses"
            options={QUANTUM_STATUSES.map((status) => ({ value: status.value, label: status.label }))}
          />
          <FilterDateRange param="day" presets={["7d", "30d", "month", "year"]} />
        </div>
      </div>

      <div className="mt-4">
        <MobileList isEmpty={todos.length === 0} empty="No to-dos found.">
          {groups.map((group) => (
            <Fragment key={group.key}>
              <li className="mt-3 flex items-baseline justify-between gap-2 px-1 first:mt-0">
                <h2 className="text-sm font-semibold">{dayLabel(group)}</h2>
                <span className="text-xs text-zinc-500">{dayCount(group)}</span>
              </li>
              {group.rows.map((todo) => {
                const data = todo.data as QuantumTodoData;
                const status = rowStatus(todo, today);
                const assignees = assigneesOf(data);
                return (
                  <ListCard
                    key={todo.id}
                    href={todo.appUrl}
                    title={todo.title}
                    subtitle={[todo.projectName, todo.listName].filter(Boolean).join(" › ")}
                    badge={<StatusPill status={status} />}
                    meta={
                      <>
                        <span>{assignees.map((person) => person.name).join(", ") || "Unassigned"}</span>
                        {!todo.completed && todo.dueOn && <span>Due {formatDay(todo.dueOn)}</span>}
                      </>
                    }
                  />
                );
              })}
            </Fragment>
          ))}
        </MobileList>
      </div>

      <DesktopTable>
        <Table>
          <TableBody>
            {todos.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-zinc-500">
                  No to-dos found.
                </TableCell>
              </TableRow>
            )}
            {groups.map((group) => (
              <Fragment key={group.key}>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableCell colSpan={3} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-semibold">{dayLabel(group)}</span>
                      <span className="text-xs text-zinc-500">{dayCount(group)}</span>
                    </div>
                  </TableCell>
                </TableRow>
                {group.rows.map((todo) => {
                  const data = todo.data as QuantumTodoData;
                  const status = rowStatus(todo, today);
                  const assignees = assigneesOf(data);
                  return (
                    <TableRow key={todo.id} className="align-top">
                      <TableCell className="w-64 py-3">
                        {assignees.length === 0 ? (
                          <span className="text-zinc-500">Unassigned</span>
                        ) : (
                          <ul className="flex flex-col gap-1.5">
                            {assignees.map((person) => (
                              <li key={person.id} className="flex items-center gap-2">
                                <EmployeeAvatar name={person.name} avatarKey={person.avatarKey} />
                                <span className="truncate">{person.name}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell className="w-28 py-3">
                        <StatusPill status={status} />
                        {!todo.completed && todo.dueOn && (
                          <div className="mt-1 text-xs text-zinc-500">Due {formatDay(todo.dueOn)}</div>
                        )}
                      </TableCell>
                      <TableCell className="py-3 whitespace-normal">
                        <a
                          href={todo.appUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-start gap-1 font-medium underline-offset-4 hover:underline"
                        >
                          {todo.title}
                          <ArrowOutwardIcon className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
                        </a>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {[todo.projectName, todo.listName].filter(Boolean).join(" › ")}
                          {data.completion?.by && ` · completed by ${data.completion.by.name}`}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </DesktopTable>

      <div className="mt-4">
        <TablePagination page={params.page} total={total} searchParams={raw} pathname="/quantum" />
      </div>
    </PageShell>
  );
}

function StatusPill({ status }: { status: QuantumStatus }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}
