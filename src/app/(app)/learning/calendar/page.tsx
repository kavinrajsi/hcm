import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/segmented";
import { isAuthor, learnerCourseWhere } from "@/lib/learning/access";
import { myCourses } from "@/lib/learning/catalog";
import { formatDay, formatTime, istDayKey, istDayStart } from "@/lib/format-date";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendar" };

// Month grid (or list) of training sessions, course live classes and the
// due dates of courses assigned to me. Days are Indian calendar days.

type Event = { id: string; day: string; time: string | null; at: number; title: string; href: string; kind: "session" | "class" | "due" };

const KIND_STYLE = {
  session: "border-l-sky-500",
  class: "border-l-orange-500",
  due: "border-l-rose-500",
} as const;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

function dayKeyPlus(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function CalendarPage({ searchParams }: PageProps<"/learning/calendar">) {
  const user = await requireUser();
  const query = await searchParams;
  const today = istDayKey(new Date());
  const month = typeof query.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month) ? query.month : today.slice(0, 7);
  const view = query.view === "list" ? "list" : "month";

  // The grid runs Sunday before the 1st to Saturday after the month's end.
  const firstDay = `${month}-01`;
  const leading = new Date(`${firstDay}T00:00:00Z`).getUTCDay();
  const gridStart = dayKeyPlus(firstDay, -leading);
  const nextMonthFirst = `${shiftMonth(month, 1)}-01`;
  const trailing = (7 - new Date(`${nextMonthFirst}T00:00:00Z`).getUTCDay()) % 7;
  const gridEnd = dayKeyPlus(nextMonthFirst, trailing);
  const from = istDayStart(gridStart);
  const to = istDayStart(gridEnd);

  const [sessions, liveClasses, lists] = await Promise.all([
    db.trainingSession.findMany({
      where: { date: { gte: from, lt: to } },
      select: { id: true, name: true, date: true },
    }),
    db.liveClass.findMany({
      where: { startsAt: { gte: from, lt: to }, course: isAuthor(user) ? {} : await learnerCourseWhere(user) },
      select: { id: true, title: true, startsAt: true, courseId: true },
    }),
    myCourses(user),
  ]);

  const events: Event[] = [
    ...sessions.map((session) => ({
      id: `s-${session.id}`,
      day: istDayKey(session.date),
      time: formatTime(session.date),
      at: session.date.getTime(),
      title: session.name,
      href: "/sessions",
      kind: "session" as const,
    })),
    ...liveClasses.map((liveClass) => ({
      id: `c-${liveClass.id}`,
      day: istDayKey(liveClass.startsAt),
      time: formatTime(liveClass.startsAt),
      at: liveClass.startsAt.getTime(),
      title: liveClass.title,
      href: `/learning/courses/${liveClass.courseId}?tab=sessions`,
      kind: "class" as const,
    })),
    ...lists.active
      .filter((course) => course.dueDate)
      .map((course) => ({
        id: `d-${course.id}`,
        // Due dates are calendar dates (stored at UTC midnight).
        day: course.dueDate!.toISOString().slice(0, 10),
        time: null,
        at: course.dueDate!.getTime(),
        title: `Due: ${course.title}`,
        href: `/learning/courses/${course.id}`,
        kind: "due" as const,
      })),
  ]
    .filter((event) => event.day >= gridStart && event.day < gridEnd)
    .sort((left, right) => left.at - right.at);

  const byDay = new Map<string, Event[]>();
  for (const event of events) byDay.set(event.day, [...(byDay.get(event.day) ?? []), event]);

  const days: string[] = [];
  for (let day = gridStart; day < gridEnd; day = dayKeyPlus(day, 1)) days.push(day);
  const [year, monthIndex] = month.split("-").map(Number);
  const link = (target: { month?: string; view?: string }) =>
    `/learning/calendar?month=${target.month ?? month}&view=${target.view ?? view}`;

  return (
    <PageShell width="full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {MONTHS[monthIndex - 1]} {year}
          </h1>
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" nativeButton={false} render={<Link href={link({ month: shiftMonth(month, -1) })} />}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" nativeButton={false} render={<Link href={link({ month: shiftMonth(month, 1) })} />}>
            <ChevronRight />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href={link({ month: today.slice(0, 7) })} />}>
            Today
          </Button>
          <Segmented
            label="Calendar view"
            items={[
              { key: "month", label: "Month", href: link({ view: "month" }), active: view === "month" },
              { key: "list", label: "List", href: link({ view: "list" }), active: view === "list" },
            ]}
          />
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-500" /> Training session</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-orange-500" /> Live class</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-rose-500" /> Course due</li>
      </ul>

      {view === "month" ? (
        <div className="mt-4 overflow-x-auto">
          <div className="grid min-w-[44rem] grid-cols-7 border-t border-l border-zinc-200 dark:border-zinc-800">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="border-r border-b border-zinc-200 px-2 py-1.5 text-sm font-medium dark:border-zinc-800">
                {weekday}
              </div>
            ))}
            {days.map((day) => {
              const inMonth = day.startsWith(month);
              const dayEvents = byDay.get(day) ?? [];
              return (
                <div
                  key={day}
                  className={cn(
                    "flex min-h-28 flex-col gap-1 border-r border-b border-zinc-200 p-1.5 dark:border-zinc-800",
                    !inMonth && "bg-muted/40",
                  )}
                >
                  <span
                    className={cn(
                      "self-end text-xs",
                      inMonth ? "text-foreground" : "text-zinc-400",
                      day === today && "flex size-6 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground",
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                  {dayEvents.slice(0, 3).map((event) => (
                    <Link
                      key={event.id}
                      href={event.href}
                      title={`${event.time ? `${event.time} ` : ""}${event.title}`}
                      className={cn("truncate rounded border-l-2 bg-muted px-1.5 py-1 text-xs hover:bg-muted/70", KIND_STYLE[event.kind])}
                    >
                      {event.time && <span className="text-zinc-500">{event.time} </span>}
                      {event.title}
                    </Link>
                  ))}
                  {dayEvents.length > 3 && (
                    <Link href={link({ view: "list" })} className="text-xs text-zinc-500 underline-offset-4 hover:underline">
                      +{dayEvents.length - 3} more
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex max-w-3xl flex-col gap-4">
          {days.filter((day) => day.startsWith(month) && byDay.has(day)).length === 0 && (
            <p className="py-12 text-center text-sm text-zinc-500">Nothing scheduled this month.</p>
          )}
          {days
            .filter((day) => day.startsWith(month) && byDay.has(day))
            .map((day) => (
              <section key={day} className="flex gap-4">
                <div className="w-24 shrink-0 text-sm">
                  <span className="block font-medium">{formatDay(day)}</span>
                  <span className="text-zinc-500">{WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]}</span>
                </div>
                <ul className="flex flex-1 flex-col gap-2">
                  {byDay.get(day)!.map((event) => (
                    <li key={event.id}>
                      <Link
                        href={event.href}
                        className={cn("block rounded-lg border border-l-4 border-zinc-200 px-3 py-2 text-sm hover:bg-muted/50 dark:border-zinc-800", KIND_STYLE[event.kind])}
                      >
                        {event.time && <span className="text-zinc-500">{event.time} · </span>}
                        {event.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </PageShell>
  );
}
