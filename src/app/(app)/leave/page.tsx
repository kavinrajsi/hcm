import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { basecampConfigured, getAccessToken } from "@/lib/basecamp";
import { listParam, parseTableParams, stringParam } from "@/lib/table-params";
import {
  LEAVE_STATUSES,
  LEAVE_STATUS_CLASSES,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  type LeaveStatusValue,
} from "@/lib/leave";
import {
  FilterDateRange,
  FilterMultiSelect,
  FilterSearch,
} from "@/components/data-table/filter-bar";
import { TablePagination } from "@/components/data-table/pagination";
import { Badge } from "@/components/ui/badge";
import { CheckIcon, CloseIcon, UndoIcon } from "@/components/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { ListCard } from "@/components/list-card";
import { Segmented } from "@/components/segmented";
import {
  LeaveEditDialog,
  LeaveHistoryDrawer,
  LeaveSyncButton,
} from "./leave-forms";
import { reviewLeave } from "./actions";
import {
  LeaveCalendar,
  groupByDay,
  isWeekend,
  key,
  monthLinks,
  parseMonth,
  type CalendarEntry,
} from "./leave-calendar";
import { LeaveDayStrip, type StripDay } from "./leave-day-strip";
import {
  leaveConditions,
  leaveDateRange,
  leaveTotalsConditions,
  leaveTotalsKind,
  leaveTotalsPeriod,
  onDays,
  type LeaveFilters,
} from "./query";
import { cn } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { formatDay, formatInstantDay } from "@/lib/format-date";

export const metadata = { title: "Leave" };

// Server Actions on this page inherit this limit — a first full Basecamp
// sync pages through years of check-in answers and classifies a batch.
export const maxDuration = 300;

type Status = LeaveStatusValue;
const STATUS_LABELS = LEAVE_STATUS_LABELS;
const STATUS_CLASSES = LEAVE_STATUS_CLASSES;

function day(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

function formatDates(start: string, end: string, postedOn: Date): string {
  return start
    ? end && end !== start
      ? `${formatDay(start)} → ${formatDay(end)}`
      : formatDay(start)
    : formatDay(postedOn);
}

function editEntry(
  entry: {
    id: string;
    creatorName: string;
    message: string;
    type: string | null;
    postedOn: Date;
    days: Prisma.Decimal | null;
  },
  start: string,
  end: string,
) {
  return {
    id: entry.id,
    creatorName: entry.creatorName,
    message: entry.message,
    type: entry.type,
    startDate: start || day(entry.postedOn),
    endDate: end,
    days: entry.days !== null ? String(entry.days) : "1",
  };
}

/** Approve / Reject (pending) or Undo — icon buttons; bigger on phone cards. */
function ReviewForm({
  id,
  status,
  large = false,
}: {
  id: string;
  status: Status;
  large?: boolean;
}) {
  const buttonClass = large
    ? "inline-flex size-10 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800"
    : "inline-flex size-7 items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800";
  const icon = large ? "size-5" : "size-4";
  return (
    <form action={reviewLeave} className="flex gap-1">
      <input type="hidden" name="id" value={id} />
      {status === "PENDING" ? (
        <>
          <button
            type="submit"
            name="decision"
            value="APPROVED"
            aria-label="Approve"
            title="Approve"
            className={cn(
              buttonClass,
              "text-emerald-600 dark:text-emerald-400",
            )}
          >
            <CheckIcon className={icon} />
          </button>
          <button
            type="submit"
            name="decision"
            value="REJECTED"
            aria-label="Reject"
            title="Reject"
            className={cn(buttonClass, "text-rose-600 dark:text-rose-400")}
          >
            <CloseIcon className={icon} />
          </button>
        </>
      ) : (
        <button
          type="submit"
          name="decision"
          value="PENDING"
          aria-label="Undo review"
          title="Undo review"
          className={cn(buttonClass, "text-zinc-500 hover:text-foreground")}
        >
          <UndoIcon className={icon} />
        </button>
      )}
    </form>
  );
}

export default async function LeavePage({ searchParams }: PageProps<"/leave">) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  // Managers see only their direct reports; HR sees everything, including
  // posts whose author matched no employee record.
  const scope: Prisma.LeaveEntryWhereInput =
    user.role === "MANAGER"
      ? { employee: { manager: { userId: user.id } } }
      : {};
  const isHr = user.role === "HR_ADMIN";

  const filters: LeaveFilters = {
    q: params.q,
    type: listParam(raw.type),
    status: listParam(raw.status),
    date: stringParam(raw.date),
    from: stringParam(raw.from),
    to: stringParam(raw.to),
  };
  // Search, type and status apply everywhere; the date range only to the
  // list and the chips (the calendar shows its own ?month=YYYY-MM).
  const and = leaveConditions(filters);
  const range = leaveDateRange(filters);
  const where: Prisma.LeaveEntryWhereInput = {
    ...scope,
    AND: range ? [...and, onDays(range)] : and,
  };

  // No ?view: day strip on phones, list on desktop. ?view=list / calendar
  // pick one explicitly (calendar = strip on phones, month grid on desktop).
  const view =
    raw.view === "calendar" ? "calendar" : raw.view === "list" ? "list" : "";
  const stripOnPhone = view !== "list";
  const month = parseMonth(
    typeof raw.month === "string" ? raw.month : undefined,
  );
  const monthEnd = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
  );
  // Calendar ignores the date range and shows entries touching the month.
  const calendarWhere: Prisma.LeaveEntryWhereInput = {
    ...scope,
    AND: [
      ...and,
      { status: { not: "REJECTED" } },
      {
        OR: [
          { startDate: { lt: monthEnd }, endDate: { gte: month } },
          { startDate: null, postedOn: { gte: month, lt: monthEnd } },
        ],
      },
    ],
  };

  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  // "Most leave days" follows the list's filters; null = the type filter
  // picks no full/half-day type, so there's nothing to total.
  // The calendar hides the date range, so the chips ignore it there too.
  const totalsFilters: LeaveFilters =
    view === "calendar"
      ? { ...filters, date: undefined, from: undefined, to: undefined }
      : filters;
  const totalsConditions = leaveTotalsConditions(totalsFilters, yearStart);
  const [
    entries,
    total,
    yearTotals,
    calendarEntries,
    statusCounts,
    typeCounts,
    unmatchedCount,
  ] = await Promise.all([
      db.leaveEntry.findMany({
        where,
        orderBy: [{ postedOn: "desc" }, { postedAt: "desc" }],
        skip: params.skip,
        take: params.take,
        include: {
          employee: { select: { id: true, name: true } },
          reviewedBy: { select: { name: true, email: true } },
        },
      }),
      db.leaveEntry.count({ where }),
      totalsConditions
        ? db.leaveEntry.groupBy({
            by: ["employeeId"],
            where: {
              ...scope,
              AND: totalsConditions,
            },
            _sum: { days: true },
            orderBy: { _sum: { days: "desc" } },
            take: 10,
          })
        : Promise.resolve([]),
      view !== "list"
        ? db.leaveEntry.findMany({
            where: calendarWhere,
            orderBy: [{ employee: { name: "asc" } }, { creatorName: "asc" }],
            select: {
              id: true,
              creatorName: true,
              type: true,
              startDate: true,
              endDate: true,
              postedOn: true,
              days: true,
              message: true,
              status: true,
              employee: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
      // Filter menu counts: every entry in scope, unfiltered.
      db.leaveEntry.groupBy({ by: ["status"], where: scope, _count: true }),
      db.leaveEntry.groupBy({ by: ["type"], where: scope, _count: true }),
      isHr
        ? db.leaveEntry.count({ where: { ...scope, employeeId: null } })
        : Promise.resolve(0),
    ]);

  const countByStatus = new Map(
    statusCounts.map((statusCount) => [statusCount.status, statusCount._count]),
  );
  const countByType = new Map(
    typeCounts.map((typeCount) => [
      typeCount.type ?? "UNCLASSIFIED",
      typeCount._count,
    ]),
  );
  const typeOptions = [
    ...LEAVE_TYPES.map((leaveType) => ({
      value: leaveType,
      label: LEAVE_TYPE_LABELS[leaveType],
      count: countByType.get(leaveType) ?? 0,
    })),
    {
      value: "UNCLASSIFIED",
      label: "Unclassified",
      count: countByType.get("UNCLASSIFIED") ?? 0,
    },
    // Managers only see their reports, so every entry has a match.
    ...(isHr
      ? [{ value: "UNMATCHED", label: "No employee match", count: unmatchedCount }]
      : []),
  ];

  const topNames = new Map(
    (
      await db.employee.findMany({
        where: {
          id: { in: yearTotals.map((yearTotal) => yearTotal.employeeId!) },
        },
        select: { id: true, name: true },
      })
    ).map((employee) => [employee.id, employee.name]),
  );

  const hrefWith = (key: string, value?: string) => {
    const query = new URLSearchParams();
    for (const [paramKey, paramValue] of Object.entries(raw)) {
      if (paramKey === key || paramKey === "page" || paramValue === undefined)
        continue;
      // Keep every value of a multi-select (?type=a&type=b).
      for (const item of Array.isArray(paramValue) ? paramValue : [paramValue])
        query.append(paramKey, item);
    }
    if (value) query.set(key, value);
    return `/leave${query.size ? `?${query}` : ""}`;
  };

  const calendar: CalendarEntry[] = calendarEntries.map((leaveEntry) => ({
    id: leaveEntry.id,
    name: leaveEntry.employee?.name ?? leaveEntry.creatorName,
    employeeId: leaveEntry.employee?.id ?? null,
    type: leaveEntry.type,
    startDate: leaveEntry.startDate,
    endDate: leaveEntry.endDate,
    postedOn: leaveEntry.postedOn,
    days: leaveEntry.days !== null ? Number(leaveEntry.days) : null,
    message: leaveEntry.message,
    status: leaveEntry.status,
  }));

  const todayKey = key(new Date());
  const stripDays: StripDay[] = [];
  for (
    let time = month.getTime();
    time < monthEnd.getTime();
    time += 86_400_000
  ) {
    const date = new Date(time);
    stripDays.push({
      key: key(date),
      weekday: "SMTWTFS"[date.getUTCDay()],
      date: date.getUTCDate(),
      label: date.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      isWeekend: isWeekend(date),
      isToday: key(date) === todayKey,
    });
  }

  const configured = basecampConfigured();
  const connected =
    isHr && configured && (await getAccessToken(user.id)) !== null;

  return (
    <PageShell>
      <PageHeader
        title="Leave"
        description={
          <>
            Imported from the Basecamp &ldquo;Post your leave here&rdquo; and
            &ldquo;Post your WFH here&rdquo; check-ins and classified
            automatically. Use the pencil icon to correct an entry.
          </>
        }
        actions={isHr && connected ? <LeaveSyncButton /> : undefined}
      />

      {isHr && !connected && (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 p-4 text-sm dark:border-zinc-700">
          {!configured ? (
            <p className="text-zinc-500">
              Basecamp sync: set BASECAMP_CLIENT_ID / BASECAMP_CLIENT_SECRET to
              enable.
            </p>
          ) : (
            <p>
              <a
                href="/api/basecamp/connect"
                className="font-medium underline underline-offset-4"
              >
                Connect Basecamp
              </a>{" "}
              <span className="text-zinc-500">to sync leave posts.</span>
            </p>
          )}
        </div>
      )}

      {yearTotals.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-zinc-500">
            Most leave days {leaveTotalsPeriod(totalsFilters)} (
            {leaveTotalsKind(filters)})
          </h2>
          {/* One swipeable row on phones, wrapping chips on desktop. */}
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            {yearTotals.map((yearTotal) => {
              const chip = (
                <>
                  {topNames.get(yearTotal.employeeId!) ?? "—"}{" "}
                  <span className="tabular-nums text-zinc-500">
                    {Number(yearTotal._sum.days ?? 0)}
                  </span>
                </>
              );
              const chipClass =
                "flex min-h-10 shrink-0 items-center gap-1 rounded-md border border-zinc-200 px-2.5 text-sm whitespace-nowrap md:min-h-0 md:py-1 dark:border-zinc-800";
              return isHr ? (
                <Link
                  key={yearTotal.employeeId}
                  href={`/employees/${yearTotal.employeeId}`}
                  className={`${chipClass} hover:bg-muted`}
                >
                  {chip}
                </Link>
              ) : (
                <span key={yearTotal.employeeId} className={chipClass}>
                  {chip}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* Row 1: one search across everything. Row 2: the filters and the view. */}
      <div className="mt-6 flex flex-col gap-3">
        <FilterSearch placeholder="Search employee, Basecamp name or message" />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:items-center [&>*]:md:min-w-0 [&>*]:md:flex-1">
            {/* The calendar and the phone day strip show a whole month, so
                no date range there (no ?view = strip on phones, list on desktop). */}
            {view !== "calendar" && (
              <div className={cn("grid", view === "" && "hidden md:grid")}>
                <FilterDateRange param="date" presets={["7d", "30d", "month", "year"]} />
              </div>
            )}
            <FilterMultiSelect param="type" label="Type" plural="Types" options={typeOptions} />
            <FilterMultiSelect
              param="status"
              label="Status"
              plural="Statuses"
              options={LEAVE_STATUSES.map((statusOption) => ({
                value: statusOption,
                label: STATUS_LABELS[statusOption],
                count: countByStatus.get(statusOption) ?? 0,
              }))}
            />
          </div>
          <div className="hidden md:block">
            <Segmented
              label="View"
              items={(["list", "calendar"] as const).map((viewOption) => ({
                key: viewOption,
                href: hrefWith(
                  "view",
                  viewOption === "calendar" ? "calendar" : undefined,
                ),
                label: viewOption === "list" ? "List" : "Calendar",
                active:
                  viewOption === "calendar"
                    ? view === "calendar"
                    : view !== "calendar",
              }))}
            />
          </div>
          <div className="md:hidden">
            <Segmented
              label="View"
              items={(["calendar", "list"] as const).map((viewOption) => ({
                key: viewOption,
                href: hrefWith(
                  "view",
                  viewOption === "list" ? "list" : undefined,
                ),
                label: viewOption === "list" ? "List" : "Calendar",
                active: viewOption === "list" ? view === "list" : view !== "list",
              }))}
            />
          </div>
        </div>
      </div>

      {stripOnPhone && (
        <div className="mt-4 md:hidden">
          <LeaveDayStrip
            key={key(month)}
            monthLabel={month.toLocaleString("en-IN", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
            days={stripDays}
            byDay={groupByDay(calendar)}
            initialKey={
              stripDays.some((stripDay) => stripDay.isToday)
                ? todayKey
                : stripDays[0].key
            }
            links={monthLinks(month, raw)}
          />
        </div>
      )}

      {view === "calendar" ? (
        <div className="mt-4 hidden md:block">
          <LeaveCalendar month={month} searchParams={raw} entries={calendar} />
        </div>
      ) : (
        <div className={cn(stripOnPhone && "hidden md:block")}>
          <div className="mt-4 md:hidden">
            <MobileList
              isEmpty={entries.length === 0}
              empty="No leave entries."
            >
              {entries.map((leaveEntry) => {
                const start = day(leaveEntry.startDate);
                const end = day(leaveEntry.endDate);
                return (
                  <ListCard
                    key={leaveEntry.id}
                    href={
                      isHr && leaveEntry.employee
                        ? `/employees/${leaveEntry.employee.id}`
                        : undefined
                    }
                    title={
                      leaveEntry.employee ? (
                        leaveEntry.employee.name
                      ) : (
                        <>
                          {leaveEntry.creatorName}
                          <span className="ml-1.5 text-xs font-normal text-zinc-400">
                            (no match)
                          </span>
                        </>
                      )
                    }
                    badge={
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs font-medium",
                          STATUS_CLASSES[leaveEntry.status],
                        )}
                      >
                        {STATUS_LABELS[leaveEntry.status]}
                      </span>
                    }
                    subtitle={
                      <p className="line-clamp-3 whitespace-pre-line">
                        {leaveEntry.message}
                      </p>
                    }
                    meta={
                      <>
                        <span className="tabular-nums">
                          {formatDates(start, end, leaveEntry.postedOn)}
                        </span>
                        {leaveEntry.type ? (
                          <Badge
                            variant={
                              leaveEntry.type === "FULL_DAY"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {LEAVE_TYPE_LABELS[leaveEntry.type]}
                          </Badge>
                        ) : (
                          <span className="text-zinc-400">unclassified</span>
                        )}
                        {leaveEntry.days !== null && (
                          <span className="tabular-nums">
                            {Number(leaveEntry.days)}d
                          </span>
                        )}
                        {leaveEntry.classifiedBy === "manual" && (
                          <span className="text-zinc-400">(edited)</span>
                        )}
                        {leaveEntry.reviewedBy && leaveEntry.reviewedAt && (
                          <span>
                            {STATUS_LABELS[leaveEntry.status]} by{" "}
                            {leaveEntry.reviewedBy.name ??
                              leaveEntry.reviewedBy.email}
                          </span>
                        )}
                      </>
                    }
                    actions={
                      <>
                        <ReviewForm
                          id={leaveEntry.id}
                          status={leaveEntry.status}
                          large
                        />
                        <LeaveEditDialog
                          asButton
                          entry={editEntry(leaveEntry, start, end)}
                        />
                        <LeaveHistoryDrawer
                          entryId={leaveEntry.id}
                          name={
                            leaveEntry.employee?.name ?? leaveEntry.creatorName
                          }
                        />
                        <a
                          href={leaveEntry.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 items-center px-2 text-sm text-zinc-500 underline underline-offset-4"
                        >
                          Basecamp
                        </a>
                      </>
                    }
                  />
                );
              })}
            </MobileList>
          </div>

          <div className="mt-4">
            <DesktopTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date(s)</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-zinc-500"
                      >
                        No leave entries.
                      </TableCell>
                    </TableRow>
                  )}
                  {entries.map((leaveEntry) => {
                    const start = day(leaveEntry.startDate);
                    const end = day(leaveEntry.endDate);
                    return (
                      <TableRow key={leaveEntry.id}>
                        <TableCell>
                          {leaveEntry.employee && isHr ? (
                            <Link
                              href={`/employees/${leaveEntry.employee.id}`}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {leaveEntry.employee.name}
                            </Link>
                          ) : leaveEntry.employee ? (
                            <span className="font-medium">
                              {leaveEntry.employee.name}
                            </span>
                          ) : (
                            <span title={leaveEntry.creatorEmail}>
                              {leaveEntry.creatorName}
                              <span className="ml-1.5 text-xs text-zinc-400">
                                (no match)
                              </span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {formatDates(start, end, leaveEntry.postedOn)}
                        </TableCell>
                        <TableCell>
                          {leaveEntry.type ? (
                            <Badge
                              variant={
                                leaveEntry.type === "FULL_DAY"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {LEAVE_TYPE_LABELS[leaveEntry.type]}
                            </Badge>
                          ) : (
                            <span className="text-xs text-zinc-400">
                              unclassified
                            </span>
                          )}
                          {leaveEntry.classifiedBy === "manual" && (
                            <span className="ml-1.5 text-xs text-zinc-400">
                              (edited)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {leaveEntry.days !== null
                            ? Number(leaveEntry.days)
                            : "—"}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p
                            className="line-clamp-2 whitespace-normal text-sm"
                            title={leaveEntry.message}
                          >
                            {leaveEntry.message}
                          </p>
                          <a
                            href={leaveEntry.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-zinc-400 underline underline-offset-4"
                          >
                            Basecamp
                          </a>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-xs font-medium",
                                STATUS_CLASSES[leaveEntry.status],
                              )}
                              title={
                                leaveEntry.reviewedBy && leaveEntry.reviewedAt
                                  ? `${STATUS_LABELS[leaveEntry.status]} by ${leaveEntry.reviewedBy.name ?? leaveEntry.reviewedBy.email} on ${formatInstantDay(leaveEntry.reviewedAt)}`
                                  : undefined
                              }
                            >
                              {STATUS_LABELS[leaveEntry.status]}
                            </span>
                            <ReviewForm
                              id={leaveEntry.id}
                              status={leaveEntry.status}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <LeaveEditDialog
                            entry={editEntry(leaveEntry, start, end)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </DesktopTable>
          </div>

          <div className="mt-4">
            <TablePagination
              page={params.page}
              total={total}
              searchParams={raw}
              pathname="/leave"
            />
          </div>
        </div>
      )}
    </PageShell>
  );
}
