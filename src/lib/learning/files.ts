import { del, head, issueSignedToken, presignUrl } from "@vercel/blob";
import { db } from "@/lib/db";
import { canOpenCourse } from "./access";

// Course files (PDFs, videos, covers) are private Vercel Blob objects under
// learning/. Browsers upload them directly (api/learning/upload) and read
// them through api/learning/files, which checks the course is open to the
// reader and passes the bytes on in capped ranges from a short-lived signed
// URL. (Browsers can't use the signed URLs themselves: the store answers
// browser requests with errors, and its CSP blanks PDF viewers.)

export const LEARNING_PREFIX = "learning/";

/** Long enough to finish a long video; a fresh link is made on every page view. */
const SIGNED_URL_TTL_MS = 4 * 60 * 60 * 1000;

export const UPLOAD_TYPES = {
  pdf: { contentTypes: ["application/pdf"], maxBytes: 100 * 1024 * 1024 },
  video: { contentTypes: ["video/mp4", "video/webm", "video/quicktime"], maxBytes: 4 * 1024 * 1024 * 1024 },
  image: { contentTypes: ["image/png", "image/jpeg", "image/webp"], maxBytes: 5 * 1024 * 1024 },
} as const;
export type UploadKind = keyof typeof UPLOAD_TYPES;

export function isLearningKey(key: string): boolean {
  return key.startsWith(LEARNING_PREFIX) && !key.includes("..");
}

/** The course a stored file belongs to (a lesson file or a cover), if any. */
export async function courseForFile(key: string): Promise<string | null> {
  const lesson = await db.lesson.findFirst({ where: { fileKey: key }, select: { courseId: true } });
  if (lesson) return lesson.courseId;
  const course = await db.course.findFirst({ where: { coverKey: key }, select: { id: true } });
  return course?.id ?? null;
}

export async function canReadFile(user: Parameters<typeof canOpenCourse>[0], key: string): Promise<boolean> {
  if (!isLearningKey(key)) return false;
  const courseId = await courseForFile(key);
  return courseId !== null && (await canOpenCourse(user, courseId));
}

export async function signedReadUrl(key: string, { download = false } = {}): Promise<string> {
  const token = await issueSignedToken({
    pathname: key,
    operations: ["get"],
    validUntil: Date.now() + SIGNED_URL_TTL_MS,
  });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname: key, access: "private" });
  if (!download) return presignedUrl;
  const url = new URL(presignedUrl);
  url.searchParams.set("download", "1");
  return url.toString();
}

/** True when an uploaded blob really exists under learning/ (checked before saving it). */
export async function blobExists(key: string): Promise<boolean> {
  if (!isLearningKey(key)) return false;
  try {
    await head(key);
    return true;
  } catch {
    return false;
  }
}

/** Deletes a replaced or removed course file; never fails the caller. */
export async function deleteLearningFile(key: string | null | undefined) {
  if (!key || !isLearningKey(key)) return;
  try {
    await del(key);
  } catch (error) {
    console.error("[learning] couldn't delete", key, error);
  }
}

/** Largest response api/learning/files sends: Function responses can't exceed 4.5 MB. */
export const CHUNK_BYTES = 4 * 1024 * 1024;

/** The byte range to send for a Range header: what was asked for, capped to one chunk. Null if unparseable. */
export function chunkRange(header: string | null): { start: number; end: number } | null {
  if (!header) return { start: 0, end: CHUNK_BYTES - 1 };
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const asked = match[2] === "" ? Infinity : Number(match[2]);
  if (asked < start) return null;
  return { start, end: Math.min(asked, start + CHUNK_BYTES - 1) };
}
