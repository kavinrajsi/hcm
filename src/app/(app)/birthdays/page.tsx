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
import { EmployeeAvatar } from "@/components/employee-avatar";

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

function label(celebration: Celebration) {
  return celebration.type === "BIRTHDAY"
    ? "🎂 Birthday"
    : `🎉 ${ordinal(celebration.years ?? 1)} work anniversary`;
}

const todayIst = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export default async function BirthdaysPage({
  searchParams,
}: PageProps<"/birthdays">) {
  const user = await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const today = todayIst();

  const monthParam =
    typeof raw.month === "string" && /^\d{4}-\d{2}$/.test(raw.month)
      ? raw.month
      : today.slice(0, 7);
  const [year, month] = monthParam.split("-").map(Number);
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
      avatarBlobKey: true,
      ...PII_SELECT,
    },
  });
  const all = celebrationsForMonth(
    employees.map((employee) => ({
      id: employee.id,
      empId: employee.empId,
      name: employee.name,
      department: employee.department,
      dateOfBirth: readPii(employee).dateOfBirth,
      dateOfJoining: employee.dateOfJoining.toISOString().slice(0, 10),
    })),
    year,
    month,
  );
  const events = all.filter(
    (celebration) =>
      type === "all" ||
      (type === "birthdays"
        ? celebration.type === "BIRTHDAY"
        : celebration.type === "ANNIVERSARY"),
  );
  const counts = {
    birthdays: all.filter((celebration) => celebration.type === "BIRTHDAY")
      .length,
    anniversaries: all.filter(
      (celebration) => celebration.type === "ANNIVERSARY",
    ).length,
  };

  const href = (patch: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const next = { month: monthParam, view, type, ...patch };
    if (next.month && next.month !== today.slice(0, 7))
      query.set("month", next.month);
    if (next.view === "list") query.set("view", "list");
    if (next.type && next.type !== "all") query.set("type", next.type);
    return `/birthdays${query.size ? `?${query}` : ""}`;
  };
  const shift = (delta: number) => {
    const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
    return shifted.toISOString().slice(0, 7);
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
            items={(Object.keys(TYPES) as TypeFilter[]).map((typeKey) => ({
              key: typeKey,
              href: href({ type: typeKey }),
              active: type === typeKey,
              label: (
                <>
                  {TYPES[typeKey]}
                  {typeKey !== "all" && (
                    <span className="ml-1.5 text-xs text-zinc-500 tabular-nums">
                      {counts[typeKey]}
                    </span>
                  )}
                </>
              ),
            }))}
          />
          <Segmented
            label="View"
            items={(["list", "calendar"] as const).map((viewKey) => ({
              key: viewKey,
              href: href({ view: viewKey }),
              active: view === viewKey,
              label: viewKey === "list" ? "List" : "Calendar",
            }))}
          />
        </div>
      </div>

      {view === "list" ? (
        <ListView
          events={events}
          today={today}
          canOpenEmployee={canOpenEmployee}
          avatars={
            new Map(
              employees.map((employee) => [
                employee.id,
                employee.avatarBlobKey,
              ]),
            )
          }
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
  celebration,
  canOpenEmployee,
}: {
  celebration: Celebration;
  canOpenEmployee: boolean;
}) {
  return canOpenEmployee ? (
    <Link
      href={`/employees/${celebration.employee.id}`}
      className="font-medium underline-offset-4 hover:underline"
    >
      {celebration.employee.name}
    </Link>
  ) : (
    <span className="font-medium">{celebration.employee.name}</span>
  );
}

function ListView({
  events,
  today,
  canOpenEmployee,
  avatars,
}: {
  events: Celebration[];
  today: string;
  canOpenEmployee: boolean;
  /** Employee id → Basecamp picture. */
  avatars: Map<string, string | null>;
}) {
  if (events.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
        Nothing to celebrate this month.
      </p>
    );
  }
  // Group by date, in order.
  const days = [...new Set(events.map((event) => event.date))];
  return (
    <ol className="mt-4 flex flex-col gap-4">
      {days.map((date) => {
        const items = events.filter((event) => event.date === date);
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
              {items.map((celebration) => (
                <li
                  key={celebration.key}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800",
                    isToday && "border-emerald-300 dark:border-emerald-500/40",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <EmployeeAvatar
                      name={celebration.employee.name}
                      avatarKey={avatars.get(celebration.employee.id)}
                    />
                    <div className="min-w-0">
                      <Name
                        celebration={celebration}
                        canOpenEmployee={canOpenEmployee}
                      />
                      <p className="text-xs text-zinc-500">
                        {celebration.employee.empId} ·{" "}
                        {celebration.employee.department}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-medium",
                      CHIP[celebration.type],
                    )}
                  >
                    {label(celebration)}
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
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    // The grid scrolls sideways inside this box on phones; the page doesn't.
    <div className="mt-4 max-w-full overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-7 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="border-b border-zinc-200 bg-muted/50 px-2 py-1.5 text-xs font-medium text-zinc-500 dark:border-zinc-800"
          >
            {weekday}
          </div>
        ))}
        {cells.map((day, cellIndex) => {
          const date = day ? `${year}-${pad(month)}-${pad(day)}` : null;
          const items = day ? events.filter((event) => event.day === day) : [];
          return (
            <div
              key={cellIndex}
              className={cn(
                "min-h-24 border-r border-b border-zinc-200 p-1.5 dark:border-zinc-800 [&:nth-child(7n)]:border-r-0",
                !day && "bg-muted/30",
                (cellIndex % 7 === 5 || cellIndex % 7 === 6) &&
                  day &&
                  "bg-muted/20",
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
                {items.map((celebration) => (
                  <li
                    key={celebration.key}
                    title={`${celebration.employee.name} — ${label(celebration)}`}
                    className={cn(
                      "truncate rounded px-1.5 py-0.5 text-xs",
                      CHIP[celebration.type],
                    )}
                  >
                    {celebration.type === "BIRTHDAY" ? "🎂 " : "🎉 "}
                    {canOpenEmployee ? (
                      <Link
                        href={`/employees/${celebration.employee.id}`}
                        className="hover:underline"
                      >
                        {celebration.employee.name}
                      </Link>
                    ) : (
                      celebration.employee.name
                    )}
                    {celebration.type === "ANNIVERSARY" &&
                      ` · ${celebration.years}y`}
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
