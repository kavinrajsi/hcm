import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/segmented";
import { KeyboardArrowDownIcon } from "@/components/icons";
import { canOpenCourse, isAuthor } from "@/lib/learning/access";
import { toEmbed } from "@/lib/learning/embeds";
import { toProgress } from "@/lib/learning/progress";
import { formatDateTime, formatInstantDay, formatTime } from "@/lib/format-date";
import { CourseCover } from "../../_components/course-cover";
import { ProgressBar } from "../../_components/progress-bar";
import { RichText } from "../../_components/rich-text";
import { AboutCourse, CourseOutline, LessonActions, LessonViewer, VisitRecorder } from "./player";

export const metadata = { title: "Course" };

const TABS = [
  ["modules", "Modules"],
  ["sessions", "Sessions"],
  ["announcements", "Announcements"],
  ["faq", "FAQ"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function CoursePage({ params, searchParams }: PageProps<"/learning/courses/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  if (!(await canOpenCourse(user, id))) notFound();
  const tab: Tab = TABS.some(([key]) => key === query.tab) ? (query.tab as Tab) : "modules";

  const course = await db.course.findUnique({
    where: { id },
    include: {
      sections: {
        orderBy: { position: "asc" },
        include: { lessons: { orderBy: { position: "asc" } } },
      },
      faqs: { orderBy: { position: "asc" } },
      liveClasses: { orderBy: { startsAt: "desc" } },
      announcements: { orderBy: { createdAt: "desc" }, take: 50 },
      enrollments: { where: { userId: user.id }, select: { lastLessonId: true } },
    },
  });
  if (!course) notFound();

  const done = new Set(
    (
      await db.lessonProgress.findMany({
        where: { userId: user.id, courseId: id },
        select: { lessonId: true },
      })
    ).map((row) => row.lessonId),
  );
  const lessons = course.sections.flatMap((section) => section.lessons);
  const progress = toProgress(lessons.filter((lesson) => done.has(lesson.id)).length, lessons.length);

  const wanted = typeof query.lesson === "string" ? query.lesson : course.enrollments[0]?.lastLessonId;
  const index = Math.max(0, lessons.findIndex((lesson) => lesson.id === wanted));
  const lesson = lessons[index] ?? null;
  const section = lesson ? course.sections.find((candidate) => candidate.id === lesson.sectionId) : null;

  const now = new Date();
  const cover = <CourseCover title={course.title} coverKey={course.coverKey} />;

  return (
    <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
      <VisitRecorder courseId={course.id} lessonId={lesson?.id ?? null} />

      <aside className="border-b border-zinc-200 lg:w-96 lg:shrink-0 lg:border-r lg:border-b-0 dark:border-zinc-800">
        <div className="p-4">
          <Link href="/learning/my" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-foreground">
            <ArrowLeft className="size-4" /> My learning
          </Link>
          <div className="mt-3 flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-start gap-3">
              <div className="w-24 shrink-0">{cover}</div>
              <div className="min-w-0 flex-1">
                <h1 className="line-clamp-2 font-semibold leading-snug">{course.title}</h1>
                {course.instructor && <p className="text-xs text-zinc-500">{course.instructor}</p>}
              </div>
              <AboutCourse
                title={course.title}
                description={course.description}
                instructor={course.instructor}
                cover={cover}
              />
            </div>
            {course.status === "DRAFT" && <Badge variant="secondary">Draft — only authors can see this</Badge>}
            <div>
              <ProgressBar progress={progress} />
              <p className="mt-1 text-xs text-zinc-500">Course progress</p>
            </div>
          </div>
        </div>
        <CourseOutline
          courseId={course.id}
          currentLessonId={lesson?.id ?? null}
          sections={course.sections.map((item) => ({
            id: item.id,
            title: item.title,
            lessons: item.lessons.map((entry) => ({
              id: entry.id,
              title: entry.title,
              kind: entry.kind,
              done: done.has(entry.id),
            })),
          }))}
        />
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6">
        <Segmented
          label="Course"
          items={TABS.map(([key, label]) => ({
            key,
            label:
              key === "faq"
                ? `FAQ (${course.faqs.length})`
                : key === "sessions" && course.liveClasses.length
                  ? `Sessions (${course.liveClasses.length})`
                  : label,
            href: `/learning/courses/${course.id}?tab=${key}${lesson ? `&lesson=${lesson.id}` : ""}`,
            active: key === tab,
          }))}
        />

        <div className="mt-5">
          {tab === "modules" &&
            (lesson ? (
              <div className="flex flex-col gap-4">
                <LessonViewer
                  courseId={course.id}
                  lesson={{
                    id: lesson.id,
                    kind: lesson.kind,
                    title: lesson.title,
                    fileUrl: lesson.fileKey ? `/api/learning/files/${lesson.fileKey}` : null,
                    embedSrc: lesson.url ? (toEmbed(lesson.url)?.src ?? null) : null,
                    done: done.has(lesson.id),
                  }}
                />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-wide text-sky-700 uppercase dark:text-sky-400">
                      {course.title}
                      {section ? ` · ${section.title}` : ""}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight">{lesson.title}</h2>
                    {lesson.durationMins ? (
                      <p className="text-sm text-zinc-500">{lesson.durationMins} min</p>
                    ) : null}
                  </div>
                  <LessonActions
                    courseId={course.id}
                    hasNext={index < lessons.length - 1}
                    lesson={{
                      id: lesson.id,
                      kind: lesson.kind,
                      title: lesson.title,
                      fileUrl: lesson.fileKey ? `/api/learning/files/${lesson.fileKey}` : null,
                      embedSrc: null,
                      done: done.has(lesson.id),
                    }}
                  />
                </div>
                {lesson.notes && (
                  <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <h3 className="font-medium">Notes</h3>
                    <RichText html={lesson.notes} />
                  </section>
                )}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
                No lessons yet.
                {isAuthor(user) && (
                  <>
                    {" "}
                    <Link href={`/learning/manage/${course.id}`} className="underline underline-offset-4">
                      Add some
                    </Link>
                    .
                  </>
                )}
              </p>
            ))}

          {tab === "sessions" && (
            <ul className="flex flex-col gap-3">
              {course.liveClasses.length === 0 && <li className="text-sm text-zinc-500">No live classes scheduled.</li>}
              {course.liveClasses.map((liveClass) => {
                const upcoming = liveClass.endsAt > now;
                return (
                  <li
                    key={liveClass.id}
                    className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 sm:flex-row sm:items-center dark:border-zinc-800"
                  >
                    <div className="w-32 shrink-0 text-sm">
                      <span className="block font-medium">{formatInstantDay(liveClass.startsAt)}</span>
                      <span className="text-zinc-500">
                        {formatTime(liveClass.startsAt)} – {formatTime(liveClass.endsAt)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{liveClass.title}</span>
                      {liveClass.trainer && <span className="block text-sm text-zinc-500">{liveClass.trainer}</span>}
                    </div>
                    <div className="flex gap-2">
                      {upcoming && liveClass.meetingUrl && (
                        <a
                          href={liveClass.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                        >
                          Join
                        </a>
                      )}
                      {liveClass.recordingUrl && (
                        <a
                          href={liveClass.recordingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
                        >
                          View recording
                        </a>
                      )}
                      {!upcoming && !liveClass.recordingUrl && <Badge variant="secondary">Ended</Badge>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {tab === "announcements" && (
            <ul className="flex flex-col gap-3">
              {course.announcements.length === 0 && <li className="text-sm text-zinc-500">No announcements for this course.</li>}
              {course.announcements.map((announcement) => (
                <li key={announcement.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{announcement.title}</span>
                    {announcement.urgency !== "NONE" && (
                      <Badge variant={announcement.urgency === "HIGH" ? "destructive" : "secondary"}>
                        {announcement.urgency.charAt(0) + announcement.urgency.slice(1).toLowerCase()}
                      </Badge>
                    )}
                    <span className="text-xs text-zinc-500">{formatDateTime(announcement.createdAt)}</span>
                  </div>
                  <RichText html={announcement.body} />
                </li>
              ))}
            </ul>
          )}

          {tab === "faq" && (
            <div className="flex max-w-3xl flex-col gap-2">
              {course.faqs.length === 0 && <p className="text-sm text-zinc-500">No FAQs yet.</p>}
              {course.faqs.map((faq) => (
                <details key={faq.id} className="group rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <summary className="cursor-pointer list-none px-4 py-3 font-medium marker:hidden">
                    <span className="flex items-center justify-between gap-3">
                      {faq.question}
                      <KeyboardArrowDownIcon className="size-5 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <p className="px-4 pb-4 text-sm whitespace-pre-line text-zinc-600 dark:text-zinc-300">{faq.answer}</p>
                </details>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
