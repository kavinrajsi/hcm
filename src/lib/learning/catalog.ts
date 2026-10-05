import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import { isAuthor, learnerCourseWhere, myAssignments } from "./access";
import { courseProgress, isComplete, type Progress } from "./progress";

// The signed-in person's courses, sorted into My learning's tabs:
// Active (assigned or started, not finished), Completed, and Explore (open
// courses they haven't started and weren't assigned).

export type MyCourse = {
  id: string;
  title: string;
  instructor: string | null;
  coverKey: string | null;
  openToAll: boolean;
  progress: Progress;
  dueDate: Date | null;
  assigned: boolean;
  started: boolean;
  lastActiveAt: Date | null;
  lastLessonId: string | null;
};

export async function myCourses(user: { id: string; role: Role }) {
  const visible = await learnerCourseWhere(user);
  const [courses, assignments] = await Promise.all([
    db.course.findMany({
      // Authors can open any course, so ones they've started count too.
      where: isAuthor(user)
        ? { OR: [visible, { enrollments: { some: { userId: user.id } } }] }
        : visible,
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        instructor: true,
        coverKey: true,
        openToAll: true,
        enrollments: {
          where: { userId: user.id },
          select: { lastActiveAt: true, lastLessonId: true },
        },
      },
    }),
    myAssignments(user),
  ]);
  const progress = await courseProgress(
    user.id,
    courses.map((course) => course.id),
  );

  const all: MyCourse[] = courses.map((course) => {
    const enrollment = course.enrollments[0];
    return {
      id: course.id,
      title: course.title,
      instructor: course.instructor,
      coverKey: course.coverKey,
      openToAll: course.openToAll,
      progress: progress.get(course.id)!,
      dueDate: assignments.get(course.id) ?? null,
      assigned: assignments.has(course.id),
      started: Boolean(enrollment),
      lastActiveAt: enrollment?.lastActiveAt ?? null,
      lastLessonId: enrollment?.lastLessonId ?? null,
    };
  });

  const recent = (left: MyCourse, right: MyCourse) =>
    (right.lastActiveAt?.getTime() ?? 0) - (left.lastActiveAt?.getTime() ?? 0) ||
    (left.dueDate?.getTime() ?? Infinity) - (right.dueDate?.getTime() ?? Infinity);

  const active = all.filter((course) => (course.assigned || course.started) && !isComplete(course.progress)).sort(recent);
  const completed = all.filter((course) => course.started && isComplete(course.progress)).sort(recent);
  const explore = all.filter((course) => course.openToAll && !course.assigned && !course.started);
  return { active, completed, explore };
}
