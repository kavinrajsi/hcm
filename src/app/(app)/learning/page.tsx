import Link from "next/link";
import { BellOff, CalendarCheck, PlayCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { PageShell } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { myCourses } from "@/lib/learning/catalog";
import { isAuthor, learnerCourseWhere } from "@/lib/learning/access";
import { announcementWhere } from "@/lib/learning/announcements";
import { formatDay, formatTime, istDayKey, istDayStart } from "@/lib/format-date";
import { CourseCard } from "./_components/course-card";

export const metadata = { title: "Learning" };

export default async function LearningDashboard() {
  const user = await requireUser();
  const now = new Date();
  const dayStart = istDayStart(istDayKey(now));
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const [lists, courseWhere, visibleAnnouncements] = await Promise.all([
    myCourses(user),
    isAuthor(user) ? Promise.resolve({}) : learnerCourseWhere(user),
    announcementWhere(user),
  ]);
  const [liveToday, sessionsToday, unread] = await Promise.all([
    db.liveClass.findMany({
      where: { startsAt: { gte: dayStart, lt: dayEnd }, course: courseWhere },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, startsAt: true, endsAt: true, meetingUrl: true, courseId: true, course: { select: { title: true } } },
    }),
    db.trainingSession.findMany({
      where: { date: { gte: dayStart, lt: dayEnd } },
      orderBy: { date: "asc" },
      select: { id: true, name: true, date: true, trainer: true },
    }),
    db.announcement.findMany({
      where: { AND: [visibleAnnouncements, { reads: { none: { userId: user.id } } }] },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, title: true, urgency: true },
    }),
  ]);

  const resume = lists.active.find((course) => course.started) ?? lists.active[0];
  const dueSoon = lists.active.filter(
    (course) => course.dueDate && course.dueDate.getTime() < now.getTime() + 7 * 86_400_000,
  );
  const lessonNumber = resume ? Math.min(resume.progress.done + 1, resume.progress.total) : 0;

  return (
    <PageShell>
      <h1 className="sr-only">Learning</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {resume ? (
            <Link
              href={`/learning/courses/${resume.id}${resume.lastLessonId ? `?lesson=${resume.lastLessonId}` : ""}`}
              className="group relative flex min-h-48 flex-col justify-between overflow-hidden rounded-2xl bg-zinc-950 p-6 text-white md:p-8"
            >
              <div>
                <p className="text-sm text-zinc-300">
                  Continue learning · lesson {lessonNumber} of {resume.progress.total}
                </p>
                <p className="mt-3 max-w-xl text-2xl font-semibold tracking-tight md:text-3xl">{resume.title}</p>
              </div>
              <PlayCircle className="mt-6 size-12 stroke-1 transition-transform group-hover:scale-105" aria-hidden />
              <span
                aria-hidden
                className="pointer-events-none absolute -right-6 -bottom-10 text-[9rem] leading-none font-black text-white/5 select-none"
              >
                {resume.progress.percent}%
              </span>
            </Link>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
              <p className="font-medium">No courses in progress</p>
              <p className="mt-1 text-sm text-zinc-500">
                {lists.explore.length > 0 ? (
                  <Link href="/learning/my?tab=explore" className="underline underline-offset-4">
                    Explore {lists.explore.length} open course{lists.explore.length === 1 ? "" : "s"}
                  </Link>
                ) : (
                  "Courses assigned to you will appear here."
                )}
              </p>
            </div>
          )}

          {lists.active.length > 0 && (
            <section className="rounded-2xl border border-zinc-200 p-4 md:p-6 dark:border-zinc-800">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-medium">Continue learning</h2>
                <Link href="/learning/my" className="text-sm underline-offset-4 hover:underline">
                  See all
                </Link>
              </div>
              <ul className="mt-4 flex snap-x gap-4 overflow-x-auto pb-2">
                {lists.active.slice(0, 6).map((course) => (
                  <li key={course.id} className="w-64 shrink-0 snap-start">
                    <CourseCard course={course} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-medium">Today&apos;s classes</h2>
              <Link href="/learning/calendar" className="text-sm underline-offset-4 hover:underline">
                Calendar
              </Link>
            </div>
            <div className="mt-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              {liveToday.length + sessionsToday.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-sm text-zinc-500">
                  <CalendarCheck className="size-8 stroke-1" aria-hidden />
                  No classes today
                </div>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {liveToday.map((liveClass) => (
                    <li key={liveClass.id}>
                      <span className="font-medium">{formatTime(liveClass.startsAt)}</span> ·{" "}
                      <Link href={`/learning/courses/${liveClass.courseId}?tab=sessions`} className="underline-offset-4 hover:underline">
                        {liveClass.title}
                      </Link>
                      <span className="block text-xs text-zinc-500">{liveClass.course.title}</span>
                      {liveClass.meetingUrl && liveClass.endsAt > now && (
                        <a href={liveClass.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                          Join
                        </a>
                      )}
                    </li>
                  ))}
                  {sessionsToday.map((session) => (
                    <li key={session.id}>
                      <span className="font-medium">{formatTime(session.date)}</span> ·{" "}
                      <Link href="/sessions" className="underline-offset-4 hover:underline">
                        {session.name}
                      </Link>
                      <span className="block text-xs text-zinc-500">Training session · {session.trainer}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-medium">At a glance</h2>
            <div className="mt-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              {unread.length === 0 && dueSoon.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center text-sm">
                  <BellOff className="size-8 stroke-1 text-zinc-400" aria-hidden />
                  <span className="font-medium">You are all caught up</span>
                  <span className="text-zinc-500">Check back later for the latest updates!</span>
                </div>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {dueSoon.map((course) => (
                    <li key={course.id}>
                      <Badge variant={course.dueDate! < now ? "destructive" : "secondary"}>
                        {course.dueDate! < now ? "Overdue" : "Due"} {formatDay(course.dueDate)}
                      </Badge>{" "}
                      <Link href={`/learning/courses/${course.id}`} className="underline-offset-4 hover:underline">
                        {course.title}
                      </Link>
                    </li>
                  ))}
                  {unread.map((announcement) => (
                    <li key={announcement.id}>
                      {announcement.urgency === "HIGH" && <Badge variant="destructive">High</Badge>}{" "}
                      <Link href="/learning/announcements?unread=1" className="underline-offset-4 hover:underline">
                        {announcement.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  );
}
