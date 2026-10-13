import { Fragment } from "react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { myEmployeeId } from "@/lib/my-employee";
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
import { NoEmployeeRecord } from "../profile/no-employee";
import { ListCard } from "@/components/list-card";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { AvatarStack } from "@/components/avatar-stack";
import { ArrowOutwardIcon } from "@/components/icons";
import { Prisma } from "@/generated/prisma/client";
import { formatDateTime, formatDay, formatWeekdayDay } from "@/lib/format-date";
import {
  QUANTUM_KINDS,
  QUANTUM_STATUSES,
  effectiveMinutes,
  formatHours,
  rowStatus,
  statusWhere,
  type QuantumStatus,
  type QuantumTodoData,
} from "@/lib/quantum/todos";
import { lastQuantumSync } from "@/lib/quantum/sync";
import { cn } from "@/lib/utils";
import { QuantumSyncForm } from "./sync-form";
import { QuantumHoursForm } from "./hours-form";

// Quantum Sheet: Basecamp to-dos laid out like Basecamp's timesheet report —
// one block per day (completed date, else due date), read from the local
// copy in QuantumTodo so filtering never calls Basecamp. HR and managers see
// every to-do; everyone else sees the to-dos assigned to them and logs their
// hours there.

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
  const user = await requireUser();
  const isTeamView = user.role === "HR_ADMIN" || user.role === "MANAGER";
  const raw = await searchParams;
  const params = parseTableParams(raw);
  const today = istDay();

  const projects = listParam(raw.project);
  const people = listParam(raw.person);
  const kindParam = listParam(raw.type);
  const kinds = QUANTUM_KINDS.map((kind) => kind.value).filter((value) => kindParam.includes(value));
  const statusParam = listParam(raw.status);
  const statuses = QUANTUM_STATUSES.map((status) => status.value).filter((value) =>
    statusParam.includes(value),
  );
  const days = dayRange({
    preset: stringParam(raw.day),
    from: stringParam(raw.from),
    to: stringParam(raw.to),
  });

  // Whose Basecamp to-dos are "mine": the viewer's linked employee record.
  const employeeId = await myEmployeeId(user);
  const me = employeeId
    ? await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, basecampPersonId: true } })
    : null;
  const myPersonId = me?.basecampPersonId ?? null;
  if (!isTeamView && !myPersonId) {
    return (
      <PageShell>
        <PageHeader title="Quantum Sheet" />
        {me ? (
          <p className="mt-6 text-sm text-zinc-500">
            Your Basecamp account isn&apos;t linked to your HCM record yet, so there are no to-dos to show. Ask HR.
          </p>
        ) : (
          <NoEmployeeRecord email={user.email} />
        )}
      </PageShell>
    );
  }

  // Trashed to-dos stay in the table (so the sync can tell) but never show.
  const visible: Prisma.QuantumTodoWhereInput = {
    status: { not: "trashed" },
    ...(isTeamView ? {} : { assigneeIds: { has: myPersonId! } }),
  };
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
  if (kinds.length) and.push({ kind: { in: kinds } });
  if (isTeamView && people.length) and.push({ assigneeIds: { hasSome: people } });
  const byStatus = statusWhere(statuses, today);
  if (byStatus) and.push(byStatus);
  if (days) and.push({ sheetDay: days });
  const where: Prisma.QuantumTodoWhereInput = { AND: and };

  // People options follow the project filter: only who works on those projects.
  const projectSql = projects.length
    ? Prisma.sql`AND "projectId" IN (${Prisma.join(projects)})`
    : Prisma.empty;
  const [todos, total, projectGroups, kindGroups, assigneeRows, lastSync] = await Promise.all([
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
    db.quantumTodo.groupBy({ by: ["kind"], where: visible, _count: true }),
    isTeamView
      ? db.$queryRaw<{ id: string; name: string; count: number }[]>`
          SELECT assignee->>'id' AS id, MAX(assignee->>'name') AS name, COUNT(*)::int AS count
          FROM "QuantumTodo", jsonb_array_elements("data"->'assignees') AS assignee
          WHERE "status" <> 'trashed' ${projectSql}
          GROUP BY assignee->>'id'`
      : [],
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
  // Day totals (to-dos, completed, hours) cover the whole day, not just the
  // rows on this page.
  const pageDays = groups.flatMap((group) => (group.day ? [group.day] : []));
  const dayScope: Prisma.QuantumTodoWhereInput[] = [];
  if (pageDays.length) dayScope.push({ sheetDay: { in: pageDays } });
  if (groups.some((group) => !group.day)) dayScope.push({ sheetDay: null });
  const dayTodos = dayScope.length
    ? await db.quantumTodo.findMany({
        where: { AND: [...and, { OR: dayScope }] },
        select: { basecampId: true, sheetDay: true, completed: true },
      })
    : [];
  const hourRows = await db.quantumHours.findMany({
    where: { todoBasecampId: { in: dayTodos.map((todo) => todo.basecampId) } },
    select: { todoBasecampId: true, source: true, minutes: true, employeeId: true },
  });
  const hoursByTodo = effectiveMinutes(hourRows);

  // Totals for everything the filters match, not just this page. Few to-dos
  // have hours, so start from those and keep the ones the filters match.
  const allHourRows = await db.quantumHours.findMany({
    select: { todoBasecampId: true, source: true, minutes: true },
  });
  const todosWithHours = [...new Set(allHourRows.map((row) => row.todoBasecampId))];
  const [matchingWithHours, completedCount] = await Promise.all([
    todosWithHours.length
      ? db.quantumTodo.findMany({
          where: { AND: [...and, { basecampId: { in: todosWithHours } }] },
          select: { basecampId: true },
        })
      : [],
    db.quantumTodo.count({ where: { AND: [...and, { completed: true }] } }),
  ]);
  const allHours = effectiveMinutes(allHourRows);
  const totalMinutes = matchingWithHours.reduce(
    (sum, todo) => sum + (allHours.get(todo.basecampId)?.minutes ?? 0),
    0,
  );
  const myHours = new Map(
    hourRows
      .filter((row) => row.source === "hcm" && me && row.employeeId === me.id)
      .map((row) => [row.todoBasecampId, row.minutes]),
  );
  const totals = new Map<string, { total: number; done: number; minutes: number }>();
  for (const todo of dayTodos) {
    const key = todo.sheetDay?.toISOString().slice(0, 10) ?? "none";
    const entry = totals.get(key) ?? { total: 0, done: 0, minutes: 0 };
    entry.total += 1;
    if (todo.completed) entry.done += 1;
    entry.minutes += hoursByTodo.get(todo.basecampId)?.minutes ?? 0;
    totals.set(key, entry);
  }

  /** The Hours cell: Basecamp hours, else HCM hours plus a box for your own when it's your to-do. */
  const hoursCell = (todo: (typeof todos)[number]) => {
    const effective = hoursByTodo.get(todo.basecampId);
    if (effective?.source === "basecamp")
      return (
        <span>
          <span className="font-medium tabular-nums">{formatHours(effective.minutes)}</span>
          <span className="ml-1 text-xs text-zinc-500">Basecamp</span>
        </span>
      );
    const mine = myPersonId !== null && todo.assigneeIds.includes(myPersonId);
    const total = effective?.minutes ?? 0;
    const minutesOfMine = myHours.get(todo.basecampId) ?? 0;
    return (
      <div className="flex flex-col gap-1">
        {total > 0 && (!mine || total !== minutesOfMine) && (
          <span className="font-medium tabular-nums">{formatHours(total)}</span>
        )}
        {mine && (
          <QuantumHoursForm
            todoId={todo.basecampId}
            hours={minutesOfMine ? Math.round((minutesOfMine / 60) * 100) / 100 : null}
          />
        )}
        {!mine && total === 0 && <span className="text-zinc-400">—</span>}
      </div>
    );
  };

  const dayLabel = (group: (typeof groups)[number]) =>
    group.day ? formatWeekdayDay(group.day) : "No due date";
  const dayCount = (group: (typeof groups)[number]) => {
    const { total: count, done, minutes } = totals.get(group.key) ?? {
      total: group.rows.length,
      done: 0,
      minutes: 0,
    };
    return [
      `${count} to-do${count === 1 ? "" : "s"}`,
      done ? `${done} completed` : "",
      minutes ? formatHours(minutes) : "",
    ]
      .filter(Boolean)
      .join(" · ");
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
        actions={isTeamView ? <QuantumSyncForm /> : undefined}
      />

      {/* Totals for the current filters (all pages). */}
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 md:mt-6">
        {[
          { label: "Total hours", value: totalMinutes ? formatHours(totalMinutes) : "0h", strong: true },
          { label: "To-dos", value: total.toLocaleString("en-IN") },
          { label: "Completed", value: completedCount.toLocaleString("en-IN") },
          { label: "With hours logged", value: matchingWithHours.length.toLocaleString("en-IN") },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <dt className="text-xs text-zinc-500">{stat.label}</dt>
            <dd className={cn("mt-0.5 text-xl font-semibold tabular-nums", stat.strong && "text-2xl")}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-col gap-3 md:mt-6">
        <FilterSearch placeholder="Search to-do, card, project or list" />
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
          {isTeamView && (
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
          )}
          <FilterMultiSelect
            param="type"
            label="Type"
            plural="Types"
            options={QUANTUM_KINDS.map((kind) => ({
              value: kind.value,
              label: kind.label,
              count: kindGroups.find((group) => group.kind === kind.value)?._count ?? 0,
            }))}
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
                    leading={assignees.length > 0 ? <AvatarStack people={assignees} max={3} /> : undefined}
                    title={
                      <>
                        <KindTag kind={todo.kind} />
                        {todo.title}
                      </>
                    }
                    subtitle={[todo.projectName, todo.listName].filter(Boolean).join(" › ")}
                    badge={<StatusPill status={status} />}
                    meta={
                      <>
                        {assignees.length === 0 && <span>Unassigned</span>}
                        {!todo.completed && todo.dueOn && <span>Due {formatDay(todo.dueOn)}</span>}
                      </>
                    }
                    actions={
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-zinc-500">Hours</span>
                        {hoursCell(todo)}
                      </div>
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
                <TableCell colSpan={4} className="py-10 text-center text-zinc-500">
                  No to-dos found.
                </TableCell>
              </TableRow>
            )}
            {groups.map((group) => (
              <Fragment key={group.key}>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableCell colSpan={4} className="py-2.5">
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
                      <TableCell className="w-40 py-3">
                        {assignees.length === 0 ? (
                          <span className="text-zinc-500">Unassigned</span>
                        ) : (
                          // Photos only; names show on hover and to screen readers.
                          <AvatarStack people={assignees} />
                        )}
                      </TableCell>
                      <TableCell className="w-36 py-3">{hoursCell(todo)}</TableCell>
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
                          <KindTag kind={todo.kind} />
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

const KIND_LABELS: Record<string, string> = Object.fromEntries(
  QUANTUM_KINDS.map((kind) => [kind.value, kind.label]),
);

/** "Card" / "Step" before the title; plain to-dos get no tag. */
function KindTag({ kind }: { kind: string }) {
  if (kind === "Todo") return null;
  return (
    <span className="mr-1.5 inline-block rounded border border-zinc-300 px-1 py-px align-middle text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      {KIND_LABELS[kind] ?? kind}
    </span>
  );
}
