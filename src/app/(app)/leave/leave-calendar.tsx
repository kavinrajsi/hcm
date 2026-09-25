import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LEAVE_TYPE_LABELS, type LeaveTypeValue } from "@/lib/leave";
import { cn } from "@/lib/utils";

// Month grid for /leave. Server-rendered; month navigation is plain links
// that keep the current filters (?view=calendar&month=YYYY-MM).

export type CalendarEntry = {
  id: string;
  name: string;
  type: LeaveTypeValue | null;
  startDate: Date | null;
  endDate: Date | null;
  postedOn: Date;
  days: number | null;
  message: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

const TYPE_CLASSES: Record<LeaveTypeValue | "UNCLASSIFIED", string> = {
  FULL_DAY: "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200",
  HALF_DAY:
    "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  LATE_ARRIVAL: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200",
  EARLY_LOGOUT:
    "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200",
  WFH: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  OTHER: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300",
  UNCLASSIFIED:
    "border border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-700",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 4;
const DAY_MS = 86_400_000;

function key(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/** Parses ?month=YYYY-MM, defaulting to the current month (UTC). */
export function parseMonth(raw: string | undefined): Date {
  const m = raw?.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const month = m ? Number(m[2]) - 1 : now.getUTCMonth();
  return new Date(Date.UTC(year, month, 1));
}

/**
 * Days an entry occupies. A post like "23rd Sep and 16th Oct" is stored as
 * one range with days = 2; when the range holds more working days than the
 * entry's day count, only the first and last day are marked.
 */
function entryDays(e: CalendarEntry): string[] {
  const start = e.startDate ?? e.postedOn;
  const end = e.endDate && e.endDate > start ? e.endDate : start;
  const all: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const d = new Date(t);
    if (!isWeekend(d) || t === start.getTime()) all.push(d);
  }
  if (e.days !== null && all.length > Math.max(1, Math.ceil(e.days))) {
    return [key(start), key(end)];
  }
  return all.map(key);
}

export function LeaveCalendar({
  month,
  entries,
  searchParams,
}: {
  month: Date;
  entries: CalendarEntry[];
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    for (const k of entryDays(e)) {
      const list = byDay.get(k) ?? [];
      list.push(e);
      byDay.set(k, list);
    }
  }

  // Grid starts on the Monday on/before the 1st, ends on the Sunday on/after month end.
  const first = month;
  const last = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  );
  const gridStart = new Date(
    first.getTime() - ((first.getUTCDay() + 6) % 7) * DAY_MS,
  );
  const gridEnd = new Date(
    last.getTime() + ((7 - last.getUTCDay()) % 7) * DAY_MS,
  );
  const cells: Date[] = [];
  for (let t = gridStart.getTime(); t <= gridEnd.getTime(); t += DAY_MS) {
    cells.push(new Date(t));
  }

  const now = new Date();
  const todayKey = key(now);
  const todayOffset =
    now.getUTCFullYear() * 12 +
    now.getUTCMonth() -
    (month.getUTCFullYear() * 12 + month.getUTCMonth());
  const monthHref = (offset: number) => {
    const d = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1),
    );
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string" && k !== "month" && k !== "page")
        params.set(k, v);
    }
    params.set("view", "calendar");
    params.set("month", key(d).slice(0, 7));
    return `/leave?${params}`;
  };

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">
          {month.toLocaleString("en-IN", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </h2>
        <div className="flex items-center gap-1">
          <Link
            href={monthHref(-1)}
            aria-label="Previous month"
            className="flex size-10 items-center justify-center rounded-md hover:bg-muted md:size-auto md:p-1.5"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link
            href={monthHref(todayOffset)}
            className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-muted md:min-h-0 md:px-2 md:py-1"
          >
            Today
          </Link>
          <Link
            href={monthHref(1)}
            aria-label="Next month"
            className="flex size-10 items-center justify-center rounded-md hover:bg-muted md:size-auto md:p-1.5"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {(Object.keys(LEAVE_TYPE_LABELS) as LeaveTypeValue[]).map((t) => (
          <span
            key={t}
            className={cn("rounded px-1.5 py-0.5", TYPE_CLASSES[t])}
          >
            {LEAVE_TYPE_LABELS[t]}
          </span>
        ))}
        <span
          className={cn("rounded px-1.5 py-0.5", TYPE_CLASSES.UNCLASSIFIED)}
        >
          Unclassified
        </span>
        <span className="rounded px-1.5 py-0.5 text-zinc-500 italic">
          <span aria-hidden>◷</span> awaiting approval
        </span>
      </div>

      {/* The grid scrolls sideways inside this box; the page itself doesn't. */}
      <div className="mt-3 max-w-full overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="border-b border-zinc-200 bg-muted/50 px-2 py-1.5 text-xs font-medium text-zinc-500 dark:border-zinc-800"
            >
              {w}
            </div>
          ))}
          {cells.map((d) => {
            const k = key(d);
            const inMonth = d.getUTCMonth() === month.getUTCMonth();
            const list = byDay.get(k) ?? [];
            return (
              <div
                key={k}
                className={cn(
                  "min-h-24 border-b border-r border-zinc-200 p-1.5 dark:border-zinc-800 [&:nth-child(7n)]:border-r-0",
                  !inMonth && "bg-muted/30 text-zinc-400",
                  isWeekend(d) && inMonth && "bg-muted/20",
                )}
              >
                <div
                  className={cn(
                    "mb-1 flex size-8 items-center justify-center rounded-full text-sm tabular-nums md:size-6 md:text-xs",
                    k === todayKey &&
                      "bg-primary font-semibold text-primary-foreground",
                  )}
                >
                  {d.getUTCDate()}
                </div>
                <ul className="flex flex-col gap-0.5">
                  {list.slice(0, MAX_CHIPS).map((e) => (
                    <li
                      key={e.id}
                      title={`${e.name} — ${e.type ? LEAVE_TYPE_LABELS[e.type] : "Unclassified"}${e.status === "PENDING" ? " (awaiting approval)" : ""}\n${e.message}`}
                      className={cn(
                        "truncate rounded px-1.5 py-0.5 text-xs",
                        TYPE_CLASSES[e.type ?? "UNCLASSIFIED"],
                        e.status === "PENDING" && "italic",
                      )}
                    >
                      {e.status === "PENDING" && <span aria-hidden>◷ </span>}
                      {e.name}
                    </li>
                  ))}
                  {list.length > MAX_CHIPS && (
                    <li>
                      <Link
                        href={`/leave?day=${d.getUTCDate()}&month=${d.getUTCMonth() + 1}&year=${d.getUTCFullYear()}`}
                        className="inline-flex min-h-8 items-center px-1.5 text-xs text-zinc-500 hover:text-foreground md:min-h-0 md:hover:underline"
                        title={list
                          .slice(MAX_CHIPS)
                          .map(
                            (e) =>
                              `${e.name} — ${e.type ? LEAVE_TYPE_LABELS[e.type] : "Unclassified"}`,
                          )
                          .join("\n")}
                      >
                        +{list.length - MAX_CHIPS} more
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
