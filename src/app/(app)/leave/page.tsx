import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { basecampConfigured, getAccessToken } from "@/lib/basecamp";
import { datePartsToRange, parseTableParams } from "@/lib/table-params";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  type LeaveTypeValue,
} from "@/lib/leave";
import { TableFilters } from "@/components/data-table/filters";
import { TablePagination } from "@/components/data-table/pagination";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LeaveEditDialog, LeaveSyncButton } from "./leave-forms";
import { reviewLeave } from "./actions";
import { LeaveCalendar, parseMonth } from "./leave-calendar";
import { cn } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Leave" };

// Server Actions on this page inherit this limit — a first full Basecamp
// sync pages through years of check-in answers and classifies a batch.
export const maxDuration = 300;

const TYPE_OPTIONS = [
  ...LEAVE_TYPES.map((t) => ({ value: t, label: LEAVE_TYPE_LABELS[t] })),
  { value: "UNCLASSIFIED", label: "Unclassified" },
  { value: "UNMATCHED", label: "No employee match" },
];

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_LABELS: Record<Status, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};
const STATUS_CLASSES: Record<Status, string> = {
  PENDING:
    "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  APPROVED:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  REJECTED: "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200",
};

function day(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function LeavePage({ searchParams }: PageProps<"/leave">) {
  const user = await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);

  // Managers see only their direct reports; HR sees everything, including
  // posts whose author matched no employee record.
  const scope: Prisma.LeaveEntryWhereInput =
    user.role === "MANAGER"
      ? { employee: { manager: { userId: user.id } } }
      : {};

  const where: Prisma.LeaveEntryWhereInput = { ...scope };
  const and: Prisma.LeaveEntryWhereInput[] = [];
  if (params.q) {
    and.push({
      OR: [
        { creatorName: { contains: params.q, mode: "insensitive" } },
        { employee: { name: { contains: params.q, mode: "insensitive" } } },
        { message: { contains: params.q, mode: "insensitive" } },
      ],
    });
  }
  if (params.type === "UNCLASSIFIED") and.push({ type: null });
  else if (params.type === "UNMATCHED") and.push({ employeeId: null });
  else if (LEAVE_TYPES.includes(params.type as LeaveTypeValue)) {
    and.push({ type: params.type as LeaveTypeValue });
  }
  const status = STATUSES.find((st) => st === raw.status);
  if (status) and.push({ status });

  const view = raw.view === "calendar" ? "calendar" : "list";
  const month = parseMonth(
    typeof raw.month === "string" ? raw.month : undefined,
  );
  const monthEnd = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
  );
  // Calendar ignores the day/month/year filter and shows entries touching the month.
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

  const range = datePartsToRange(params);
  if (range) {
    and.push({
      OR: [{ startDate: range }, { startDate: null, postedOn: range }],
    });
  }
  if (and.length) where.AND = and;

  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const [entries, total, yearTotals, calendarEntries, pendingCount] =
    await Promise.all([
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
      db.leaveEntry.groupBy({
        by: ["employeeId"],
        where: {
          ...scope,
          employeeId: { not: null },
          type: { in: ["FULL_DAY", "HALF_DAY"] },
          status: { not: "REJECTED" },
          startDate: { gte: yearStart },
        },
        _sum: { days: true },
        orderBy: { _sum: { days: "desc" } },
        take: 10,
      }),
      view === "calendar"
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
              employee: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      db.leaveEntry.count({ where: { ...scope, status: "PENDING" } }),
    ]);

  const topNames = new Map(
    (
      await db.employee.findMany({
        where: { id: { in: yearTotals.map((t) => t.employeeId!) } },
        select: { id: true, name: true },
      })
    ).map((e) => [e.id, e.name]),
  );

  const isHr = user.role === "HR_ADMIN";
  const configured = basecampConfigured();
  const connected =
    isHr && configured && (await getAccessToken(user.id)) !== null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Leave</h1>
        {isHr && connected && <LeaveSyncButton />}
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Imported from the Basecamp &ldquo;Post your leave here&rdquo; check-in
        and classified automatically. Use Edit to correct an entry.
      </p>

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
            Most leave days in {yearStart.getUTCFullYear()} (full + half days)
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {yearTotals.map((t) => (
              <Link
                key={t.employeeId}
                href={`/employees/${t.employeeId}`}
                className="rounded-md border border-zinc-200 px-2.5 py-1 text-sm hover:bg-muted dark:border-zinc-800"
              >
                {topNames.get(t.employeeId!) ?? "—"}{" "}
                <span className="tabular-nums text-zinc-500">
                  {Number(t._sum.days ?? 0)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <TableFilters typeOptions={TYPE_OPTIONS} />
        <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 text-sm dark:border-zinc-800">
          {(["list", "calendar"] as const).map((v) => {
            const qs = new URLSearchParams();
            for (const [k, val] of Object.entries(raw)) {
              if (typeof val === "string" && k !== "view" && k !== "page")
                qs.set(k, val);
            }
            if (v === "calendar") qs.set("view", "calendar");
            return (
              <Link
                key={v}
                href={`/leave${qs.size ? `?${qs}` : ""}`}
                aria-current={view === v ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 capitalize",
                  view === v
                    ? "bg-muted font-medium"
                    : "text-zinc-500 hover:text-foreground",
                )}
              >
                {v}
              </Link>
            );
          })}
        </div>
      </div>

      {view === "calendar" ? (
        <div className="mt-4">
          <LeaveCalendar
            month={month}
            searchParams={raw}
            entries={calendarEntries.map((e) => ({
              id: e.id,
              name: e.employee?.name ?? e.creatorName,
              type: e.type,
              startDate: e.startDate,
              endDate: e.endDate,
              postedOn: e.postedOn,
              days: e.days !== null ? Number(e.days) : null,
              message: e.message,
              status: e.status,
            }))}
          />
        </div>
      ) : (
        <>
          <nav className="mt-4 flex gap-1 text-sm" aria-label="Status">
            {([undefined, ...STATUSES] as const).map((st) => {
              const qs = new URLSearchParams();
              for (const [k, val] of Object.entries(raw)) {
                if (typeof val === "string" && k !== "status" && k !== "page")
                  qs.set(k, val);
              }
              if (st) qs.set("status", st);
              const active = status === st;
              return (
                <Link
                  key={st ?? "ALL"}
                  href={`/leave${qs.size ? `?${qs}` : ""}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1",
                    active
                      ? "bg-muted font-medium"
                      : "text-zinc-500 hover:text-foreground",
                  )}
                >
                  {st ? STATUS_LABELS[st] : "All"}
                  {st === "PENDING" && pendingCount > 0 && (
                    <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white tabular-nums">
                      {pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
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
                {entries.map((e) => {
                  const start = day(e.startDate);
                  const end = day(e.endDate);
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        {e.employee ? (
                          <Link
                            href={`/employees/${e.employee.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {e.employee.name}
                          </Link>
                        ) : (
                          <span title={e.creatorEmail}>
                            {e.creatorName}
                            <span className="ml-1.5 text-xs text-zinc-400">
                              (no match)
                            </span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {start
                          ? end && end !== start
                            ? `${start} → ${end}`
                            : start
                          : day(e.postedOn)}
                      </TableCell>
                      <TableCell>
                        {e.type ? (
                          <Badge
                            variant={
                              e.type === "FULL_DAY" ? "default" : "secondary"
                            }
                          >
                            {LEAVE_TYPE_LABELS[e.type]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-zinc-400">
                            unclassified
                          </span>
                        )}
                        {e.classifiedBy === "manual" && (
                          <span className="ml-1.5 text-xs text-zinc-400">
                            (edited)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {e.days !== null ? Number(e.days) : "—"}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p
                          className="line-clamp-2 whitespace-normal text-sm"
                          title={e.message}
                        >
                          {e.message}
                        </p>
                        <a
                          href={e.link}
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
                              STATUS_CLASSES[e.status],
                            )}
                            title={
                              e.reviewedBy && e.reviewedAt
                                ? `${STATUS_LABELS[e.status]} by ${e.reviewedBy.name ?? e.reviewedBy.email} on ${day(e.reviewedAt)}`
                                : undefined
                            }
                          >
                            {STATUS_LABELS[e.status]}
                          </span>
                          <form action={reviewLeave} className="flex gap-2">
                            <input type="hidden" name="id" value={e.id} />
                            {e.status === "PENDING" ? (
                              <>
                                <button
                                  type="submit"
                                  name="decision"
                                  value="APPROVED"
                                  className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                                >
                                  Approve
                                </button>
                                <button
                                  type="submit"
                                  name="decision"
                                  value="REJECTED"
                                  className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <button
                                type="submit"
                                name="decision"
                                value="PENDING"
                                className="text-xs text-zinc-400 hover:text-foreground"
                              >
                                Undo
                              </button>
                            )}
                          </form>
                        </div>
                      </TableCell>
                      <TableCell>
                        <LeaveEditDialog
                          entry={{
                            id: e.id,
                            creatorName: e.creatorName,
                            message: e.message,
                            type: e.type,
                            startDate: start || day(e.postedOn),
                            endDate: end,
                            days: e.days !== null ? String(e.days) : "1",
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4">
            <TablePagination
              page={params.page}
              total={total}
              searchParams={raw}
              pathname="/leave"
            />
          </div>
        </>
      )}
    </main>
  );
}
