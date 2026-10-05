import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { PageShell } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AUTHOR_ROLES } from "@/lib/learning/access";
import { formatInstantDay } from "@/lib/format-date";
import { CourseCover } from "../_components/course-cover";

export const metadata = { title: "Manage courses" };

export default async function ManageCoursesPage() {
  await requirePageRole(...AUTHOR_ROLES);
  const courses = await db.course.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      openToAll: true,
      coverKey: true,
      updatedAt: true,
      _count: { select: { lessons: true, enrollments: true, assignments: true } },
    },
  });
  const completed = await db.courseEnrollment.groupBy({
    by: ["courseId"],
    where: { completedAt: { not: null } },
    _count: { _all: true },
  });
  const completedBy = new Map(completed.map((row) => [row.courseId, row._count._all]));

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Manage courses</h1>
        <Button nativeButton={false} render={<Link href="/learning/manage/new" />}>
          New course
        </Button>
      </div>
      {courses.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No courses yet. Create one, add sections and lessons, then publish it.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <li key={course.id}>
              <Link
                href={`/learning/manage/${course.id}`}
                className="flex h-full flex-col gap-3 rounded-xl border border-zinc-200 p-3 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
              >
                <CourseCover title={course.title} coverKey={course.coverKey} />
                <div className="flex flex-wrap items-center gap-2 px-1">
                  <Badge variant={course.status === "PUBLISHED" ? "default" : "secondary"}>
                    {course.status === "PUBLISHED" ? "Published" : "Draft"}
                  </Badge>
                  {course.openToAll && <Badge variant="outline">Open to all</Badge>}
                </div>
                <span className="px-1 font-medium">{course.title}</span>
                <span className="mt-auto px-1 text-xs text-zinc-500">
                  {course._count.lessons} lessons · {course._count.assignments} assignments ·{" "}
                  {course._count.enrollments} started · {completedBy.get(course.id) ?? 0} completed · updated{" "}
                  {formatInstantDay(course.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
