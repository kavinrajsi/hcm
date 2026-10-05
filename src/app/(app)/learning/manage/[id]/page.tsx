import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { PageShell } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/segmented";
import { AUTHOR_ROLES } from "@/lib/learning/access";
import { formatDateTime, formatDay } from "@/lib/format-date";
import {
  deleteCourse,
  deleteFaq,
  deleteLesson,
  deleteLiveClass,
  deleteSection,
  moveItem,
  removeAssignment,
  setCourseStatus,
} from "../actions";
import {
  AddSectionForm,
  AssignmentForm,
  CourseForm,
  FaqForm,
  LessonEditor,
  LiveClassForm,
  RenameSectionForm,
} from "../forms";

export const metadata = { title: "Edit course" };

const TABS = [
  ["content", "Content"],
  ["details", "Details"],
  ["faq", "FAQ"],
  ["assign", "Assign"],
  ["classes", "Live classes"],
] as const;
type Tab = (typeof TABS)[number][0];

const KIND_LABEL = { PDF: "PDF", VIDEO: "Video", YOUTUBE: "YouTube", VIMEO: "Vimeo" } as const;

function MoveButtons({ kind, id }: { kind: "section" | "lesson"; id: string }) {
  return (
    <span className="flex">
      {(["up", "down"] as const).map((direction) => (
        <form key={direction} action={moveItem}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="direction" value={direction} />
          <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Move ${kind} ${direction}`}>
            {direction === "up" ? <ArrowUp /> : <ArrowDown />}
          </Button>
        </form>
      ))}
    </span>
  );
}

export default async function EditCoursePage({ params, searchParams }: PageProps<"/learning/manage/[id]">) {
  await requirePageRole(...AUTHOR_ROLES);
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.some(([key]) => key === rawTab) ? (rawTab as Tab) : "content";

  const course = await db.course.findUnique({
    where: { id },
    include: {
      sections: {
        orderBy: { position: "asc" },
        include: { lessons: { orderBy: { position: "asc" } } },
      },
      faqs: { orderBy: { position: "asc" } },
      assignments: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      },
      liveClasses: { orderBy: { startsAt: "desc" } },
    },
  });
  if (!course) notFound();
  const lessonCount = course.sections.reduce((sum, section) => sum + section.lessons.length, 0);

  const [departments, employees] =
    tab === "assign"
      ? await Promise.all([
          db.employee.findMany({
            where: { dateOfExit: null },
            distinct: ["department"],
            orderBy: { department: "asc" },
            select: { department: true },
          }),
          db.employee.findMany({
            where: { dateOfExit: null, userId: { not: null } },
            orderBy: { name: "asc" },
            select: { id: true, empId: true, name: true },
          }),
        ])
      : [[], []];

  const publishing = course.status === "DRAFT";

  return (
    <PageShell>
      <Link href="/learning/manage" className="text-sm text-zinc-500 hover:text-foreground">
        ← All courses
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{course.title}</h1>
          <Badge variant={publishing ? "secondary" : "default"}>{publishing ? "Draft" : "Published"}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href={`/learning/courses/${course.id}`} />}>
            Preview
          </Button>
          <form action={setCourseStatus.bind(null, course.id)}>
            <input type="hidden" name="status" value={publishing ? "PUBLISHED" : "DRAFT"} />
            <Button type="submit" disabled={publishing && lessonCount === 0}>
              {publishing ? "Publish" : "Unpublish"}
            </Button>
          </form>
        </div>
      </div>
      {publishing && lessonCount === 0 && (
        <p className="mt-2 text-sm text-zinc-500">Add at least one lesson before publishing.</p>
      )}

      <div className="mt-6">
        <Segmented
          label="Course editor"
          items={TABS.map(([key, label]) => ({
            key,
            label: key === "faq" ? `FAQ (${course.faqs.length})` : label,
            href: `/learning/manage/${course.id}?tab=${key}`,
            active: key === tab,
          }))}
        />
      </div>

      <div className="mt-6">
        {tab === "details" && (
          <div className="flex flex-col gap-10">
            <CourseForm
              courseId={course.id}
              defaults={{
                title: course.title,
                description: course.description,
                instructor: course.instructor,
                coverKey: course.coverKey,
                openToAll: course.openToAll,
              }}
            />
            <form action={deleteCourse.bind(null, course.id)} className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <p className="mb-2 text-sm text-zinc-500">
                Deleting removes every section, lesson, file, FAQ, assignment and everyone&apos;s progress.
              </p>
              <Button type="submit" variant="destructive">
                Delete course
              </Button>
            </form>
          </div>
        )}

        {tab === "content" && (
          <div className="flex flex-col gap-6">
            {course.sections.length === 0 && (
              <p className="text-sm text-zinc-500">Start with a section (a module or week), then add lessons to it.</p>
            )}
            {course.sections.map((section) => (
              <section key={section.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-wrap items-end gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
                  <RenameSectionForm sectionId={section.id} title={section.title} />
                  <MoveButtons kind="section" id={section.id} />
                  <form action={deleteSection.bind(null, section.id)}>
                    <Button type="submit" variant="ghost" size="sm" className="text-red-600">
                      Delete section
                    </Button>
                  </form>
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {section.lessons.map((lesson) => (
                    <li key={lesson.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <Badge variant="outline">{KIND_LABEL[lesson.kind]}</Badge>
                      <span className="min-w-0 flex-1 truncate font-medium">{lesson.title}</span>
                      {lesson.durationMins ? <span className="text-xs text-zinc-500">{lesson.durationMins} min</span> : null}
                      <MoveButtons kind="lesson" id={lesson.id} />
                      <LessonEditor
                        lessonId={lesson.id}
                        label="Edit"
                        defaults={{
                          title: lesson.title,
                          kind: lesson.kind,
                          fileKey: lesson.fileKey,
                          url: lesson.url,
                          notes: lesson.notes,
                          durationMins: lesson.durationMins,
                        }}
                      />
                      <form action={deleteLesson.bind(null, lesson.id)}>
                        <Button type="submit" variant="ghost" size="sm" className="text-red-600">
                          Delete
                        </Button>
                      </form>
                    </li>
                  ))}
                  <li className="p-3">
                    <LessonEditor sectionId={section.id} label="Add lesson" />
                  </li>
                </ul>
              </section>
            ))}
            <AddSectionForm courseId={course.id} />
          </div>
        )}

        {tab === "faq" && (
          <div className="flex max-w-2xl flex-col gap-6">
            <p className="text-sm text-zinc-500">
              FAQs show on the course&apos;s FAQ tab. Add them whenever questions come up, before or after publishing.
            </p>
            {course.faqs.map((faq) => (
              <div key={faq.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <FaqForm faqId={faq.id} defaults={{ question: faq.question, answer: faq.answer }} />
                <form action={deleteFaq.bind(null, faq.id)} className="mt-2">
                  <Button type="submit" variant="ghost" size="sm" className="text-red-600">
                    Delete FAQ
                  </Button>
                </form>
              </div>
            ))}
            <div className="rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
              <h2 className="mb-3 font-medium">Add an FAQ</h2>
              <FaqForm courseId={course.id} />
            </div>
          </div>
        )}

        {tab === "assign" && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-zinc-500">
              Assigned courses appear in people&apos;s My learning, with the due date on their calendar. A department
              assignment also covers people who join it later. {course.status === "DRAFT" && "Nobody sees it until it's published."}
            </p>
            <AssignmentForm
              courseId={course.id}
              departments={departments.map((row) => row.department)}
              employees={employees}
            />
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
              {course.assignments.length === 0 && <li className="px-4 py-3 text-zinc-500">Not assigned to anyone yet.</li>}
              {course.assignments.map((assignment) => (
                <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>
                    <span className="font-medium">
                      {assignment.target === "ALL"
                        ? "Everyone"
                        : assignment.target === "DEPARTMENT"
                          ? assignment.department
                          : (assignment.user?.name ?? assignment.user?.email)}
                    </span>
                    <span className="text-zinc-500">
                      {assignment.dueDate ? ` · due ${formatDay(assignment.dueDate)}` : " · no due date"}
                    </span>
                  </span>
                  <form action={removeAssignment.bind(null, assignment.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "classes" && (
          <div className="flex flex-col gap-6">
            <div className="max-w-2xl rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
              <LiveClassForm courseId={course.id} />
            </div>
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
              {course.liveClasses.length === 0 && <li className="px-4 py-3 text-zinc-500">No live classes yet.</li>}
              {course.liveClasses.map((liveClass) => (
                <li key={liveClass.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>
                    <span className="font-medium">{liveClass.title}</span>
                    <span className="block text-xs text-zinc-500">
                      {formatDateTime(liveClass.startsAt)}
                      {liveClass.trainer ? ` · ${liveClass.trainer}` : ""}
                    </span>
                  </span>
                  <form action={deleteLiveClass.bind(null, liveClass.id)}>
                    <Button type="submit" variant="ghost" size="sm" className="text-red-600">
                      Delete
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PageShell>
  );
}
