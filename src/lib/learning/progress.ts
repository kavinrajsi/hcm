import { db } from "@/lib/db";

// Lesson completion and per-course progress. A course counts as complete
// when every current lesson is done, worked out at read time, so a lesson
// added later puts it back under Active.

export type Progress = { done: number; total: number; percent: number };

export function toProgress(done: number, total: number): Progress {
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function isComplete(progress: Progress): boolean {
  return progress.total > 0 && progress.done >= progress.total;
}

/** done/total lessons per course for one person, in two grouped queries. */
export async function courseProgress(userId: string, courseIds: string[]): Promise<Map<string, Progress>> {
  if (courseIds.length === 0) return new Map();
  const [totals, done] = await Promise.all([
    db.lesson.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds } }, _count: { _all: true } }),
    db.lessonProgress.groupBy({
      by: ["courseId"],
      where: { userId, courseId: { in: courseIds } },
      _count: { _all: true },
    }),
  ]);
  const doneBy = new Map(done.map((row) => [row.courseId, row._count._all]));
  const result = new Map<string, Progress>();
  for (const id of courseIds) {
    const total = totals.find((row) => row.courseId === id)?._count._all ?? 0;
    result.set(id, toProgress(Math.min(doneBy.get(id) ?? 0, total), total));
  }
  return result;
}

/** Lesson ids of a course in reading order (section, then lesson position). */
export async function lessonOrder(courseId: string): Promise<string[]> {
  const sections = await db.courseSection.findMany({
    where: { courseId },
    orderBy: { position: "asc" },
    select: { lessons: { orderBy: { position: "asc" }, select: { id: true } } },
  });
  return sections.flatMap((section) => section.lessons.map((lesson) => lesson.id));
}

/** Remembers the lesson someone is on, starting their enrollment if new. */
export async function touchEnrollment(userId: string, courseId: string, lessonId: string | null) {
  await db.courseEnrollment.upsert({
    where: { courseId_userId: { courseId, userId } },
    create: { courseId, userId, lastLessonId: lessonId },
    update: { lastActiveAt: new Date(), ...(lessonId ? { lastLessonId: lessonId } : {}) },
  });
}

/**
 * Marks a lesson done for this person. Returns the next lesson in the
 * course (null at the end) and whether the whole course is now complete.
 */
export async function completeLesson(userId: string, lessonId: string) {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { id: true, courseId: true } });
  if (!lesson) return null;
  const { courseId } = lesson;
  await db.lessonProgress.upsert({
    where: { lessonId_userId: { lessonId, userId } },
    create: { lessonId, userId, courseId },
    update: {},
  });

  const order = await lessonOrder(courseId);
  const index = order.indexOf(lessonId);
  const nextLessonId = index >= 0 ? (order[index + 1] ?? null) : null;
  const progress = (await courseProgress(userId, [courseId])).get(courseId)!;
  const courseCompleted = isComplete(progress);

  await db.courseEnrollment.upsert({
    where: { courseId_userId: { courseId, userId } },
    create: {
      courseId,
      userId,
      lastLessonId: nextLessonId ?? lessonId,
      completedAt: courseCompleted ? new Date() : null,
    },
    update: {
      lastLessonId: nextLessonId ?? lessonId,
      lastActiveAt: new Date(),
      ...(courseCompleted ? { completedAt: new Date() } : {}),
    },
  });
  return { courseId, nextLessonId, courseCompleted };
}
