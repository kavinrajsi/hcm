"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { invalid, type FormState } from "@/lib/form-state";
import { requireRole, requireUser } from "@/lib/rbac";
import { AUTHOR_ROLES, canOpenCourse } from "@/lib/learning/access";
import { completeLesson, touchEnrollment } from "@/lib/learning/progress";
import { sanitizeNotes } from "@/lib/learning/notes";

// Learner actions (any signed-in person, for courses open to them) and
// announcement posting (authors).

async function lessonCourse(lessonId: string) {
  return db.lesson.findUnique({ where: { id: lessonId }, select: { courseId: true } });
}

/** Opening a lesson: start the enrollment and remember where they are. */
export async function recordVisit(courseId: string, lessonId: string | null) {
  const user = await requireUser();
  if (!(await canOpenCourse(user, courseId))) return;
  if (lessonId && (await lessonCourse(lessonId))?.courseId !== courseId) return;
  await touchEnrollment(user.id, courseId, lessonId);
}

export async function markLessonComplete(lessonId: string) {
  const user = await requireUser();
  const lesson = await lessonCourse(lessonId);
  if (!lesson || !(await canOpenCourse(user, lesson.courseId))) return null;
  const result = await completeLesson(user.id, lessonId);
  revalidatePath("/learning", "layout");
  return result;
}

/** Marks the given announcements read for the signed-in person. */
export async function markAnnouncementsRead(announcementIds: string[]) {
  const user = await requireUser();
  const ids = announcementIds.filter((id) => typeof id === "string").slice(0, 200);
  if (ids.length === 0) return;
  await db.announcementRead.createMany({
    data: ids.map((announcementId) => ({ announcementId, userId: user.id })),
    skipDuplicates: true,
  });
}

const announcementSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string(),
  urgency: z.enum(["HIGH", "MEDIUM", "LOW", "NONE"], { error: "Pick an urgency" }),
  courseId: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value)),
});

export async function createAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole(...AUTHOR_ROLES);
  const parsed = announcementSchema.safeParse({
    title: formData.get("title") ?? "",
    body: formData.get("body") ?? "",
    urgency: formData.get("urgency"),
    courseId: formData.get("courseId") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const body = sanitizeNotes(parsed.data.body);
  if (!body) return { fieldErrors: { body: ["Write the announcement"] }, error: "Write the announcement" };
  if (parsed.data.courseId && !(await db.course.count({ where: { id: parsed.data.courseId } })))
    return { fieldErrors: { courseId: ["Course not found"] }, error: "Course not found" };

  await db.announcement.create({
    data: { ...parsed.data, body, createdById: user.id },
  });
  revalidatePath("/learning", "layout");
  return { ok: true };
}

export async function deleteAnnouncement(announcementId: string) {
  await requireRole(...AUTHOR_ROLES);
  await db.announcement.delete({ where: { id: announcementId } });
  revalidatePath("/learning", "layout");
}
