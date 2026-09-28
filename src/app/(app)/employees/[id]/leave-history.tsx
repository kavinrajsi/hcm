import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DesktopTable, MobileList } from "@/components/page";
import { ListCard } from "@/components/list-card";
import { Segmented } from "@/components/segmented";
import {
  LEAVE_STATUS_CLASSES,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
} from "@/lib/leave";
import {
  filterByYear,
  leaveYears,
  summarizeLeave,
  type HistoryEntry,
} from "@/lib/leave-history";
import { cn } from "@/lib/utils";

// Employee page: every Basecamp leave post for this employee, by year, with
// the same "leave days" rule as the Leave page. Read-only — corrections are
// made on the Leave page.

export type LeaveHistoryRow = HistoryEntry & {
  message: string;
  link: string;
  classifiedBy: string | null;
  reviewedBy: string | null;
};

const day = (date: Date) => date.toISOString().slice(0, 10);

function dates(entry: LeaveHistoryRow) {
  const start = entry.startDate ?? entry.postedOn;
  return entry.endDate && entry.startDate && entry.endDate > entry.startDate
    ? `${day(start)} → ${day(entry.endDate)}`
    : day(start);
}

function TypeBadge({ entry }: { entry: LeaveHistoryRow }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {entry.type ? (
        <Badge variant={entry.type === "FULL_DAY" ? "default" : "secondary"}>
          {LEAVE_TYPE_LABELS[entry.type]}
        </Badge>
      ) : (
        <span className="text-xs text-zinc-400">Unclassified</span>
      )}
      {entry.classifiedBy === "manual" && (
        <span className="text-xs text-zinc-400">(edited)</span>
      )}
    </span>
  );
}

function StatusChip({ entry }: { entry: LeaveHistoryRow }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium",
        LEAVE_STATUS_CLASSES[entry.status],
      )}
      title={entry.reviewedBy ? `by ${entry.reviewedBy}` : undefined}
    >
      {LEAVE_STATUS_LABELS[entry.status]}
    </span>
  );
}

export function LeaveHistory({
  employeeId,
  employeeName,
  entries,
  year: requested,
}: {
  employeeId: string;
  employeeName: string;
  entries: LeaveHistoryRow[];
  year: string | undefined;
}) {
  const years = leaveYears(entries);
  const thisYear = new Date().getUTCFullYear();
  const year: number | "all" =
    requested === "all"
      ? "all"
      : years.includes(Number(requested))
        ? Number(requested)
        : years.includes(thisYear)
          ? thisYear
          : (years[0] ?? thisYear);
  const shown = filterByYear(entries, year);
  const summary = summarizeLeave(shown);
  const period = year === "all" ? "all time" : String(year);

  const tiles = [
    ["Leave days", summary.leaveDays],
    ["Full days", summary.fullDays],
    ["Half days", summary.halfDays],
    ["Late arrivals", summary.late],
    ["Early logouts", summary.early],
    ["WFH", summary.wfh],
    ["Pending review", summary.pending],
  ] as const;

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 p-4 text-sm md:p-5 dark:border-zinc-800">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-medium">Leave history</h2>
          <p className="text-xs text-zinc-500">
            {entries.length} Basecamp post{entries.length === 1 ? "" : "s"} in
            total ·{" "}
            <Link
              href={`/leave?view=list&q=${encodeURIComponent(employeeName)}`}
              className="underline underline-offset-4"
            >
              Open in Leave
            </Link>
          </p>
        </div>
        {years.length > 0 && (
          <Segmented
            label="Year"
            items={[
              ...years.map((yearOption) => ({
                key: String(yearOption),
                href: `/employees/${employeeId}?leaveYear=${yearOption}#leave-history`,
                label: String(yearOption),
                active: year === yearOption,
              })),
              {
                key: "all",
                href: `/employees/${employeeId}?leaveYear=all#leave-history`,
                label: "All",
                active: year === "all",
              },
            ]}
          />
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map(([label, value]) => (
          <div
            key={label}
            className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
          >
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            <dt className="text-xs text-zinc-500">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <MobileList
          isEmpty={shown.length === 0}
          empty={`No leave posts for this employee in ${period}.`}
        >
          {shown.map((entry) => (
            <ListCard
              key={entry.id}
              title={<span className="tabular-nums">{dates(entry)}</span>}
              badge={<StatusChip entry={entry} />}
              subtitle={
                <p className="line-clamp-3 whitespace-pre-line">
                  {entry.message}
                </p>
              }
              meta={
                <>
                  <TypeBadge entry={entry} />
                  {entry.days !== null && (
                    <span className="tabular-nums">{entry.days}d</span>
                  )}
                  {entry.reviewedBy && <span>by {entry.reviewedBy}</span>}
                  <a
                    href={entry.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    Basecamp
                  </a>
                </>
              }
            />
          ))}
        </MobileList>
      </div>

      <DesktopTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date(s)</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500">
                  No leave posts for this employee in {period}.
                </TableCell>
              </TableRow>
            )}
            {shown.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {dates(entry)}
                </TableCell>
                <TableCell>
                  <TypeBadge entry={entry} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {entry.days ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-0.5">
                    <StatusChip entry={entry} />
                    {entry.reviewedBy && (
                      <span className="text-xs text-zinc-400">
                        by {entry.reviewedBy}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-md">
                  <p
                    className="line-clamp-2 whitespace-normal"
                    title={entry.message}
                  >
                    {entry.message}
                  </p>
                  <a
                    href={entry.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-400 underline underline-offset-4"
                  >
                    Basecamp
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DesktopTable>
    </section>
  );
}
