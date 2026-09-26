"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEAVE_TYPE_LABELS, type LeaveTypeValue } from "@/lib/leave";
import { TYPE_CLASSES, type CalendarEntry } from "./leave-calendar";

// Phone view of /leave, after the Today at Apple calendar: a swipeable row of
// the month's days in a grey band, and the selected day's leave below. The
// month's entries arrive pre-grouped, so picking a day needs no request.

export type StripDay = {
  key: string; // YYYY-MM-DD
  weekday: string; // single letter
  date: number;
  label: string; // "Fri, 26 Sep"
  isWeekend: boolean;
  isToday: boolean;
};

const MAX_DOTS = 3;

// Solid versions of the chip colours — the pale chip fills vanish as dots.
const DOT_CLASSES: Record<LeaveTypeValue, string> = {
  FULL_DAY: "bg-rose-500",
  HALF_DAY: "bg-amber-500",
  LATE_ARRIVAL: "bg-sky-500",
  EARLY_LOGOUT: "bg-violet-500",
  WFH: "bg-emerald-500",
  OTHER: "bg-zinc-500",
};

export function LeaveDayStrip({
  monthLabel,
  days,
  byDay,
  initialKey,
  links,
  filters,
}: {
  monthLabel: string;
  days: StripDay[];
  byDay: Record<string, CalendarEntry[]>;
  initialKey: string;
  links: { prev: string; today: string; next: string };
  filters: React.ReactNode;
}) {
  const [selected, setSelected] = useState(initialKey);
  const rowRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Bring the initial day (today, or the 1st) into the middle of the row.
  // The page re-keys this component per month, so this runs once per month.
  // Sets the row's scrollLeft directly: scrollIntoView would also scroll the
  // page vertically.
  useEffect(() => {
    const row = rowRef.current;
    const cell = selectedRef.current;
    if (!row || !cell) return;
    row.scrollLeft = cell.offsetLeft - (row.clientWidth - cell.offsetWidth) / 2;
  }, []);

  const day = days.find((d) => d.key === selected) ?? days[0];
  const list = byDay[day.key] ?? [];

  return (
    <section>
      <div className="-mx-4 border-y border-zinc-200 bg-muted/50 px-4 pt-3 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{monthLabel}</h2>
          <div className="flex items-center">
            <Link
              href={links.prev}
              aria-label="Previous month"
              className="flex size-10 items-center justify-center rounded-md"
            >
              <ChevronLeft className="size-5" />
            </Link>
            <Link
              href={links.today}
              className="flex min-h-10 items-center rounded-md px-2 text-sm"
            >
              Today
            </Link>
            <Link
              href={links.next}
              aria-label="Next month"
              className="flex size-10 items-center justify-center rounded-md"
            >
              <ChevronRight className="size-5" />
            </Link>
          </div>
        </div>

        {/* Seven days per screen; swipe for the rest of the month. */}
        <div
          ref={rowRef}
          className="relative -mx-4 mt-2 flex snap-x snap-mandatory overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {days.map((d) => {
            const entries = byDay[d.key] ?? [];
            const isSelected = d.key === day.key;
            return (
              <div
                key={d.key}
                ref={isSelected ? selectedRef : undefined}
                className="flex w-[calc(100%/7)] shrink-0 snap-start flex-col items-center gap-2"
              >
                <span
                  className={cn(
                    "text-sm font-medium",
                    d.isWeekend && "text-zinc-400",
                  )}
                >
                  {d.weekday}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(d.key)}
                  aria-pressed={isSelected}
                  aria-label={`${d.label}, ${entries.length} on leave`}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full text-base tabular-nums transition-colors",
                    isSelected
                      ? "bg-foreground font-semibold text-background"
                      : "bg-background/70 dark:bg-background/30",
                    !isSelected &&
                      d.isToday &&
                      "font-semibold ring-2 ring-foreground/70",
                    !isSelected && d.isWeekend && "text-zinc-400",
                  )}
                >
                  {d.date}
                </button>
                <span className="flex h-1.5 gap-0.5" aria-hidden>
                  {entries.slice(0, MAX_DOTS).map((e) => (
                    <span
                      key={e.id}
                      className={cn(
                        "size-1.5 rounded-full",
                        e.type ? DOT_CLASSES[e.type] : "bg-zinc-400",
                      )}
                    />
                  ))}
                </span>
              </div>
            );
          })}
        </div>

        <div className="-mx-4 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          {filters}
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-base font-medium">
          {day.label}
          <span className="ml-2 font-normal text-zinc-500">
            {list.length === 0 ? "" : `${list.length} on leave`}
          </span>
        </h3>
        {list.length === 0 ? (
          <p className="py-12 text-center text-zinc-500">
            No one on leave this day.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {list.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-2">
                  {e.employeeId ? (
                    <Link
                      href={`/employees/${e.employeeId}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {e.name}
                    </Link>
                  ) : (
                    <span className="font-medium">
                      {e.name}
                      <span className="ml-1.5 text-xs font-normal text-zinc-400">
                        (no match)
                      </span>
                    </span>
                  )}
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                      TYPE_CLASSES[e.type ?? "UNCLASSIFIED"],
                    )}
                  >
                    {e.type ? LEAVE_TYPE_LABELS[e.type] : "Unclassified"}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm whitespace-pre-line text-zinc-600 dark:text-zinc-400">
                  {e.message}
                </p>
                <p className="mt-1.5 flex gap-3 text-xs text-zinc-500">
                  {e.days !== null && (
                    <span className="tabular-nums">{e.days}d</span>
                  )}
                  {e.status === "PENDING" && (
                    <span className="italic">◷ Awaiting approval</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
