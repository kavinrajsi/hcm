import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { PII_SELECT, readPii } from "@/lib/employee-pii";
import {
  celebrationsForMonth,
  ordinal,
  relativeDay,
  type Celebration,
} from "@/lib/celebrations";
import { PageHeader, PageShell } from "@/components/page";
import { Segmented } from "@/components/segmented";
import { cn } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Birthdays & Anniversaries" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TYPES = {
  all: "All",
  birthdays: "Birthdays",
  anniversaries: "Anniversaries",
} as const;
type TypeFilter = keyof typeof TYPES;

const CHIP = {
  BIRTHDAY: "bg-pink-100 text-pink-900 dark:bg-pink-500/20 dark:text-pink-200",
  ANNIVERSARY: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200",
};

function label(c: Celebration) {
  return c.type === "BIRTHDAY"
    ? "🎂 Birthday"
    : `🎉 ${ordinal(c.years ?? 1)} work anniversary`;
}

const todayIst = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export default async function BirthdaysPage({
  searchParams,
}: PageProps<"/birthdays">) {
  const user = await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const today = todayIst();

  const m =
    typeof raw.month === "string" && /^\d{4}-\d{2}$/.test(raw.month)
      ? raw.month
      : today.slice(0, 7);
  const [year, month] = m.split("-").map(Number);
  // Calendar is the default; ?view=list for the list.
  const view = raw.view === "list" ? "list" : "calendar";
  const type: TypeFilter =
    raw.type === "birthdays" || raw.type === "anniversaries" ? raw.type : "all";

  // Managers see their direct reports; HR sees everyone. Current staff only.
  const where: Prisma.EmployeeWhereInput = {
    dateOfExit: null,
    ...(user.role === "MANAGER" ? { manager: { userId: user.id } } : {}),
  };
  const employees = await db.employee.findMany({
    where,
    select: {
      id: true,
      empId: true,
      name: true,
      department: true,
      dateOfJoining: true,
      ...PII_SELECT,
    },
  });
  const all = celebrationsForMonth(
    employees.map((e) => ({
      id: e.id,
      empId: e.empId,
      name: e.name,
      department: e.department,
      dateOfBirth: readPii(e).dateOfBirth,
      dateOfJoining: e.dateOfJoining.toISOString().slice(0, 10),
    })),
    year,
    month,
  );
  const events = all.filter(
    (c) =>
      type === "all" ||
      (type === "birthdays" ? c.type === "BIRTHDAY" : c.type === "ANNIVERSARY"),
  );
  const counts = {
    birthdays: all.filter((c) => c.type === "BIRTHDAY").length,
    anniversaries: all.filter((c) => c.type === "ANNIVERSARY").length,
  };

  const href = (patch: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    const next = { month: m, view, type, ...patch };
    if (next.month && next.month !== today.slice(0, 7))
      qs.set("month", next.month);
    if (next.view === "list") qs.set("view", "list");
    if (next.type && next.type !== "all") qs.set("type", next.type);
    return `/birthdays${qs.size ? `?${qs}` : ""}`;
  };
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    return d.toISOString().slice(0, 7);
  };
  const monthTitle = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    "en-IN",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
  const canOpenEmployee = user.role === "HR_ADMIN";

  return (
    <PageShell>
      <PageHeader
        title="Birthdays & Anniversaries"
        description="Employee birthdays and work anniversaries by month. Birthdays show the day only — never the year."
      />

      <div className="mt-5 flex flex-col gap-3 md:mt-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between gap-2 md:justify-start">
          <h2 className="text-lg font-medium">{monthTitle}</h2>
          <div className="flex items-center">
            <Link
              href={href({ month: shift(-1) })}
              aria-label="Previous month"
              className="flex size-10 items-center justify-center rounded-md hover:bg-muted md:size-8"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <Link
              href={href({ month: today.slice(0, 7) })}
              className="flex min-h-10 items-center rounded-md px-2 text-sm hover:bg-muted md:min-h-8"
            >
              Today
            </Link>
            <Link
              href={href({ month: shift(1) })}
              aria-label="Next month"
              className="flex size-10 items-center justify-center rounded-md hover:bg-muted md:size-8"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Show"
            items={(Object.keys(TYPES) as TypeFilter[]).map((t) => ({
              key: t,
              href: href({ type: t }),
              active: type === t,
              label: (
                <>
                  {TYPES[t]}
                  {t !== "all" && (
                    <span className="ml-1.5 text-xs text-zinc-500 tabular-nums">
                      {counts[t]}
                    </span>
                  )}
                </>
              ),
            }))}
          />
          <Segmented
            label="View"
            items={(["list", "calendar"] as const).map((v) => ({
              key: v,
              href: href({ view: v }),
              active: view === v,
              label: v === "list" ? "List" : "Calendar",
            }))}
          />
        </div>
      </div>

      {view === "list" ? (
        <ListView
          events={events}
          today={today}
          canOpenEmployee={canOpenEmployee}
        />
      ) : (
        <CalendarView
          events={events}
          year={year}
          month={month}
          today={today}
          canOpenEmployee={canOpenEmployee}
        />
      )}
    </PageShell>
  );
}

function Name({
  c,
  canOpenEmployee,
}: {
  c: Celebration;
  canOpenEmployee: boolean;
}) {
  return canOpenEmployee ? (
    <Link
      href={`/employees/${c.employee.id}`}
      className="font-medium underline-offset-4 hover:underline"
    >
      {c.employee.name}
    </Link>
  ) : (
    <span className="font-medium">{c.employee.name}</span>
  );
}

function ListView({
  events,
  today,
  canOpenEmployee,
}: {
  events: Celebration[];
  today: string;
  canOpenEmployee: boolean;
}) {
  if (events.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
        Nothing to celebrate this month.
      </p>
    );
  }
  // Group by date, in order.
  const days = [...new Set(events.map((e) => e.date))];
  return (
    <ol className="mt-4 flex flex-col gap-4">
      {days.map((date) => {
        const items = events.filter((e) => e.date === date);
        const isToday = date === today;
        return (
          <li key={date}>
            <h3
              className={cn(
                "flex items-baseline gap-2 text-sm font-medium",
                isToday && "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              })}
              <span className="text-xs font-normal text-zinc-500">
                {relativeDay(date, today)}
              </span>
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {items.map((c) => (
                <li
                  key={c.key}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800",
                    isToday && "border-emerald-300 dark:border-emerald-500/40",
                  )}
                >
                  <div className="min-w-0">
                    <Name c={c} canOpenEmployee={canOpenEmployee} />
                    <p className="text-xs text-zinc-500">
                      {c.employee.empId} · {c.employee.department}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-medium",
                      CHIP[c.type],
                    )}
                  >
                    {label(c)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function CalendarView({
  events,
  year,
  month,
  today,
  canOpenEmployee,
}: {
  events: Celebration[];
  year: number;
  month: number;
  today: string;
  canOpenEmployee: boolean;
}) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    // The grid scrolls sideways inside this box on phones; the page doesn't.
    <div className="mt-4 max-w-full overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-7 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="border-b border-zinc-200 bg-muted/50 px-2 py-1.5 text-xs font-medium text-zinc-500 dark:border-zinc-800"
          >
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          const date = day ? `${year}-${pad(month)}-${pad(day)}` : null;
          const items = day ? events.filter((e) => e.day === day) : [];
          return (
            <div
              key={i}
              className={cn(
                "min-h-24 border-r border-b border-zinc-200 p-1.5 dark:border-zinc-800 [&:nth-child(7n)]:border-r-0",
                !day && "bg-muted/30",
                (i % 7 === 5 || i % 7 === 6) && day && "bg-muted/20",
              )}
            >
              {day && (
                <div
                  className={cn(
                    "mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    date === today &&
                      "bg-primary font-semibold text-primary-foreground",
                  )}
                >
                  {day}
                </div>
              )}
              <ul className="flex flex-col gap-0.5">
                {items.map((c) => (
                  <li
                    key={c.key}
                    title={`${c.employee.name} — ${label(c)}`}
                    className={cn(
                      "truncate rounded px-1.5 py-0.5 text-xs",
                      CHIP[c.type],
                    )}
                  >
                    {c.type === "BIRTHDAY" ? "🎂 " : "🎉 "}
                    {canOpenEmployee ? (
                      <Link
                        href={`/employees/${c.employee.id}`}
                        className="hover:underline"
                      >
                        {c.employee.name}
                      </Link>
                    ) : (
                      c.employee.name
                    )}
                    {c.type === "ANNIVERSARY" && ` · ${c.years}y`}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
