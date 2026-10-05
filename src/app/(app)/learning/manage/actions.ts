"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { fieldError, invalid, type FormState } from "@/lib/form-state";
import { requireRole } from "@/lib/rbac";
import { parseIstLocal } from "@/lib/format-date";
import { AUTHOR_ROLES } from "@/lib/learning/access";
import { toEmbed } from "@/lib/learning/embeds";
import { sanitizeNotes } from "@/lib/learning/notes";
import { blobExists, deleteLearningFile } from "@/lib/learning/files";

// Course authoring for HR admins and managers. Every action re-checks the
// role (server actions are reachable by direct POST).

export type LearningFormState = FormState;

const requireAuthor = () => requireRole(...AUTHOR_ROLES);
const refresh = () => revalidatePath("/learning", "layout");

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

// --- Courses -----------------------------------------------------------------

const courseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(5000),
  instructor: optionalText,
  openToAll: z.boolean(),
  coverKey: optionalText,
});

function readCourse(formData: FormData) {
  return courseSchema.safeParse({
    title: text(formData, "title"),
    description: text(formData, "description"),
    instructor: text(formData, "instructor"),
    openToAll: formData.get("openToAll") === "on",
    coverKey: text(formData, "coverKey"),
  });
}

export async function createCourse(_prev: LearningFormState, formData: FormData): Promise<LearningFormState> {
  const user = await requireAuthor();
  const parsed = readCourse(formData);
  if (!parsed.success) return invalid(parsed.error);
  if (parsed.data.coverKey && !(await blobExists(parsed.data.coverKey)))
    return fieldError("coverKey", "That cover didn't finish uploading. Try again.");

  const course = await db.course.create({
    data: { ...parsed.data, createdById: user.id },
    select: { id: true },
  });
  refresh();
  redirect(`/learning/manage/${course.id}`);
}

export async function updateCourse(
  courseId: string,
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  await requireAuthor();
  const parsed = readCourse(formData);
  if (!parsed.success) return invalid(parsed.error);
  const existing = await db.course.findUnique({ where: { id: courseId }, select: { coverKey: true } });
  if (!existing) return { error: "Course not found" };
  if (
    parsed.data.coverKey &&
    parsed.data.coverKey !== existing.coverKey &&
    !(await blobExists(parsed.data.coverKey))
  )
    return fieldError("coverKey", "That cover didn't finish uploading. Try again.");

  await db.course.update({ where: { id: courseId }, data: parsed.data });
  if (existing.coverKey && existing.coverKey !== parsed.data.coverKey) await deleteLearningFile(existing.coverKey);
  refresh();
  return { ok: "Saved." };
}

export async function setCourseStatus(courseId: string, formData: FormData) {
  await requireAuthor();
  const status = formData.get("status") === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  await db.course.update({ where: { id: courseId }, data: { status } });
  refresh();
}

export async function deleteCourse(courseId: string) {
  await requireAuthor();
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { coverKey: true, lessons: { select: { fileKey: true } } },
  });
  if (!course) return;
  await db.course.delete({ where: { id: courseId } });
  await Promise.all(
    [course.coverKey, ...course.lessons.map((lesson) => lesson.fileKey)].map(deleteLearningFile),
  );
  refresh();
  redirect("/learning/manage");
}

// --- Sections ----------------------------------------------------------------

const titleSchema = z.object({ title: z.string().trim().min(1, "Title is required").max(200) });

export async function addSection(
  courseId: string,
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  await requireAuthor();
  const parsed = titleSchema.safeParse({ title: text(formData, "title") });
  if (!parsed.success) return invalid(parsed.error);
  const last = await db.courseSection.aggregate({ where: { courseId }, _max: { position: true } });
  await db.courseSection.create({
    data: { courseId, title: parsed.data.title, position: (last._max.position ?? -1) + 1 },
  });
  refresh();
  return { ok: true };
}

export async function renameSection(
  sectionId: string,
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  await requireAuthor();
  const parsed = titleSchema.safeParse({ title: text(formData, "title") });
  if (!parsed.success) return invalid(parsed.error);
  await db.courseSection.update({ where: { id: sectionId }, data: { title: parsed.data.title } });
  refresh();
  return { ok: "Saved." };
}

export async function deleteSection(sectionId: string) {
  await requireAuthor();
  const lessons = await db.lesson.findMany({ where: { sectionId }, select: { fileKey: true } });
  await db.courseSection.delete({ where: { id: sectionId } });
  await Promise.all(lessons.map((lesson) => deleteLearningFile(lesson.fileKey)));
  refresh();
}

/** Swaps a section or lesson with its neighbour above (-1) or below (+1). */
async function swapPosition(
  kind: "section" | "lesson",
  id: string,
  direction: -1 | 1,
) {
  if (kind === "section") {
    const row = await db.courseSection.findUnique({ where: { id }, select: { courseId: true, position: true } });
    if (!row) return;
    const neighbour = await db.courseSection.findFirst({
      where: { courseId: row.courseId, position: direction < 0 ? { lt: row.position } : { gt: row.position } },
      orderBy: { position: direction < 0 ? "desc" : "asc" },
      select: { id: true, position: true },
    });
    if (!neighbour) return;
    await db.$transaction([
      db.courseSection.update({ where: { id }, data: { position: neighbour.position } }),
      db.courseSection.update({ where: { id: neighbour.id }, data: { position: row.position } }),
    ]);
  } else {
    const row = await db.lesson.findUnique({ where: { id }, select: { sectionId: true, position: true } });
    if (!row) return;
    const neighbour = await db.lesson.findFirst({
      where: { sectionId: row.sectionId, position: direction < 0 ? { lt: row.position } : { gt: row.position } },
      orderBy: { position: direction < 0 ? "desc" : "asc" },
      select: { id: true, position: true },
    });
    if (!neighbour) return;
    await db.$transaction([
      db.lesson.update({ where: { id }, data: { position: neighbour.position } }),
      db.lesson.update({ where: { id: neighbour.id }, data: { position: row.position } }),
    ]);
  }
}

export async function moveItem(formData: FormData) {
  await requireAuthor();
  const kind = formData.get("kind") === "section" ? "section" : "lesson";
  const id = text(formData, "id");
  const direction = formData.get("direction") === "up" ? -1 : 1;
  if (id) await swapPosition(kind, id, direction);
  refresh();
}

// --- Lessons -----------------------------------------------------------------

const lessonSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  kind: z.enum(["PDF", "VIDEO", "YOUTUBE", "VIMEO"], { error: "Pick a lesson type" }),
  fileKey: optionalText,
  url: optionalText,
  notes: z.string(),
  durationMins: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value)))
    .pipe(z.number().int("Whole minutes").min(0).max(1000).nullable()),
});

type LessonInput = {
  title: string;
  kind: "PDF" | "VIDEO" | "YOUTUBE" | "VIMEO";
  fileKey: string | null;
  url: string | null;
  notes: string | null;
  durationMins: number | null;
};

/** Validated lesson fields, or a form error. `currentFileKey` skips re-checking an unchanged file. */
async function readLesson(
  formData: FormData,
  currentFileKey: string | null,
): Promise<{ data: LessonInput } | { error: LearningFormState }> {
  const parsed = lessonSchema.safeParse({
    title: text(formData, "title"),
    kind: formData.get("kind"),
    fileKey: text(formData, "fileKey"),
    url: text(formData, "url"),
    notes: text(formData, "notes"),
    durationMins: text(formData, "durationMins"),
  });
  if (!parsed.success) return { error: invalid(parsed.error) };
  const { kind, fileKey, url } = parsed.data;
  const notes = sanitizeNotes(parsed.data.notes) || null;

  if (kind === "PDF" || kind === "VIDEO") {
    if (!fileKey) return { error: fieldError("fileKey", `Upload the ${kind === "PDF" ? "PDF" : "video"} first`) };
    if (fileKey !== currentFileKey && !(await blobExists(fileKey)))
      return { error: fieldError("fileKey", "That file didn't finish uploading. Try again.") };
    return { data: { ...parsed.data, url: null, notes } };
  }
  const embed = url ? toEmbed(url) : null;
  if (!embed || embed.provider !== kind)
    return {
      error: fieldError("url", kind === "YOUTUBE" ? "Paste a YouTube video link" : "Paste a Vimeo video link"),
    };
  return { data: { ...parsed.data, fileKey: null, notes } };
}

export async function addLesson(
  sectionId: string,
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  await requireAuthor();
  const section = await db.courseSection.findUnique({ where: { id: sectionId }, select: { courseId: true } });
  if (!section) return { error: "Section not found" };
  const result = await readLesson(formData, null);
  if ("error" in result) return result.error;
  const last = await db.lesson.aggregate({ where: { sectionId }, _max: { position: true } });
  await db.lesson.create({
    data: {
      ...result.data,
      sectionId,
      courseId: section.courseId,
      position: (last._max.position ?? -1) + 1,
    },
  });
  refresh();
  return { ok: true };
}

export async function updateLesson(
  lessonId: string,
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  await requireAuthor();
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { fileKey: true } });
  if (!lesson) return { error: "Lesson not found" };
  const result = await readLesson(formData, lesson.fileKey);
  if ("error" in result) return result.error;
  await db.lesson.update({ where: { id: lessonId }, data: result.data });
  if (lesson.fileKey && lesson.fileKey !== result.data.fileKey) await deleteLearningFile(lesson.fileKey);
  refresh();
  return { ok: "Saved." };
}

export async function deleteLesson(lessonId: string) {
  await requireAuthor();
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { fileKey: true } });
  if (!lesson) return;
  await db.lesson.delete({ where: { id: lessonId } });
  await deleteLearningFile(lesson.fileKey);
  refresh();
}

// --- FAQs (addable at any time, published or not) ---------------------------

const faqSchema = z.object({
  question: z.string().trim().min(1, "Question is required").max(500),
  answer: z.string().trim().min(1, "Answer is required").max(5000),
});

export async function addFaq(
  courseId: string,
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  await requireAuthor();
  const parsed = faqSchema.safeParse({ question: text(formData, "question"), answer: text(formData, "answer") });
  if (!parsed.success) return invalid(parsed.error);
  const last = await db.courseFaq.aggregate({ where: { courseId }, _max: { position: true } });
  await db.courseFaq.create({ data: { ...parsed.data, courseId, position: (last._max.position ?? -1) + 1 } });
  refresh();
  return { ok: true };
}

export async function updateFaq(
  faqId: string,
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  await requireAuthor();
  const parsed = faqSchema.safeParse({ question: text(formData, "question"), answer: text(formData, "answer") });
  if (!parsed.success) return invalid(parsed.error);
  await db.courseFaq.update({ where: { id: faqId }, data: parsed.data });
  refresh();
  return { ok: "Saved." };
}

export async function deleteFaq(faqId: string) {
  await requireAuthor();
  await db.courseFaq.delete({ where: { id: faqId } });
  refresh();
}

// --- Assignments -------------------------------------------------------------

const assignmentSchema = z.object({
  target: z.enum(["ALL", "DEPARTMENT", "USER"], { error: "Pick who it's for" }),
  department: optionalText,
  employeeId: optionalText,
  dueDate: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").nullable()),
});

export async function addAssignment(
  courseId: string,
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  const user = await requireAuthor();
  const parsed = assignmentSchema.safeParse({
    target: formData.get("target"),
    department: text(formData, "department"),
    employeeId: text(formData, "employeeId"),
    dueDate: text(formData, "dueDate"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { target, department, employeeId, dueDate } = parsed.data;

  let userId: string | null = null;
  if (target === "DEPARTMENT") {
    if (!department) return fieldError("department", "Pick a department");
    const exists = await db.employee.count({ where: { department } });
    if (!exists) return fieldError("department", "No employees in that department");
  }
  if (target === "USER") {
    if (!employeeId) return fieldError("employeeId", "Pick a person");
    const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { userId: true } });
    if (!employee?.userId) return fieldError("employeeId", "That person has no HCM login yet");
    userId = employee.userId;
  }

  await db.courseAssignment.create({
    data: {
      courseId,
      target,
      department: target === "DEPARTMENT" ? department : null,
      userId,
      dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : null,
      assignedById: user.id,
    },
  });
  refresh();
  return { ok: true };
}

export async function removeAssignment(assignmentId: string) {
  await requireAuthor();
  await db.courseAssignment.delete({ where: { id: assignmentId } });
  refresh();
}

// --- Live classes ------------------------------------------------------------

const linkSchema = optionalText.pipe(
  z
    .string()
    .url("Enter a full link (https://…)")
    .refine((value) => /^https?:\/\//.test(value), "Enter a full link (https://…)")
    .nullable(),
);

const liveClassSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  startsAt: z.string().min(1, "Start is required"),
  endsAt: z.string().min(1, "End is required"),
  trainer: optionalText,
  meetingUrl: linkSchema,
  recordingUrl: linkSchema,
});

export async function addLiveClass(
  courseId: string,
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  await requireAuthor();
  const parsed = liveClassSchema.safeParse({
    title: text(formData, "title"),
    startsAt: text(formData, "startsAt"),
    endsAt: text(formData, "endsAt"),
    trainer: text(formData, "trainer"),
    meetingUrl: text(formData, "meetingUrl"),
    recordingUrl: text(formData, "recordingUrl"),
  });
  if (!parsed.success) return invalid(parsed.error);
  // datetime-local values are Indian time; new Date() would read them as UTC.
  const startsAt = parseIstLocal(parsed.data.startsAt);
  const endsAt = parseIstLocal(parsed.data.endsAt);
  if (!startsAt) return fieldError("startsAt", "Pick a start time");
  if (!endsAt) return fieldError("endsAt", "Pick an end time");
  if (endsAt <= startsAt) return fieldError("endsAt", "Ends after it starts");

  await db.liveClass.create({ data: { ...parsed.data, courseId, startsAt, endsAt } });
  refresh();
  return { ok: true };
}

export async function deleteLiveClass(liveClassId: string) {
  await requireAuthor();
  await db.liveClass.delete({ where: { id: liveClassId } });
  refresh();
}
