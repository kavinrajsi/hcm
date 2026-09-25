"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { uploadResume } from "@/lib/blob";
import { CANDIDATE_STATUSES, type CandidateStatus } from "./statuses";
import {
  BOARD_PAGE_SIZE,
  MANUAL_SOURCE,
  POSITIONS,
  candidateWhere,
  statusWhere,
  toCandidateDetail,
  type CandidateFilters,
} from "./query";
import type { CandidateDetail } from "./candidate-dialog";
import { appendNote, removeNote } from "./notes";

const updateSchema = z.object({
  id: z.string().regex(/^\d+$/),
  status: z.enum(CANDIDATE_STATUSES),
});

export type CandidateFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  ok?: boolean;
};

export async function updateCandidate(
  _prev: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  await requireRole("HR_ADMIN");
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.candidate.update({
    where: { id: BigInt(parsed.data.id) },
    data: { status: parsed.data.status },
  });
  revalidatePath("/candidates");
  return { ok: true };
}

const moveSchema = z.object({
  id: z.string().regex(/^\d+$/),
  status: z.enum(CANDIDATE_STATUSES),
});

/** Board drag & drop / "Move to" menu. */
export async function setCandidateStatus(
  id: string,
  status: CandidateStatus,
): Promise<void> {
  await requireRole("HR_ADMIN");
  const parsed = moveSchema.parse({ id, status });
  await db.candidate.update({
    where: { id: BigInt(parsed.id) },
    data: { status: parsed.status },
  });
  revalidatePath("/candidates");
}

const filtersSchema = z.object({
  q: z.string().max(200).optional(),
  position: z.string().max(50).optional(),
});

/** Next page of one board column, with the board's current filters. */
export async function loadMoreCandidates(
  status: CandidateStatus,
  offset: number,
  filters: CandidateFilters,
): Promise<CandidateDetail[]> {
  await requireRole("HR_ADMIN");
  const s = z.enum(CANDIDATE_STATUSES).parse(status);
  const f = filtersSchema.parse(filters);
  const rows = await db.candidate.findMany({
    where: { AND: [...candidateWhere(f), statusWhere(s)] },
    orderBy: { createdAt: "desc" },
    skip: Math.max(0, Math.floor(offset)),
    take: BOARD_PAGE_SIZE,
  });
  return rows.map(toCandidateDetail);
}

const noteSchema = z.object({
  id: z.string().regex(/^\d+$/),
  text: z.string().trim().min(1, "Note is empty").max(5000),
});

/** Appends to the candidate's JSON note log (same shape as the old app). */
export async function addCandidateNote(
  _prev: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  await requireRole("HR_ADMIN");
  const parsed = noteSchema.safeParse({
    id: formData.get("id"),
    text: formData.get("text"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid note" };
  }
  const id = BigInt(parsed.data.id);
  await db.$transaction(async (tx) => {
    const row = await tx.candidate.findUniqueOrThrow({
      where: { id },
      select: { notes: true },
    });
    await tx.candidate.update({
      where: { id },
      data: { notes: appendNote(row.notes, parsed.data.text) },
    });
  });
  revalidatePath("/candidates");
  return { ok: true };
}

export async function deleteCandidateNote(
  candidateId: string,
  noteId: string,
): Promise<void> {
  await requireRole("HR_ADMIN");
  const id = BigInt(z.string().regex(/^\d+$/).parse(candidateId));
  const nid = z.string().min(1).max(64).parse(noteId);
  await db.$transaction(async (tx) => {
    const row = await tx.candidate.findUniqueOrThrow({
      where: { id },
      select: { notes: true },
    });
    await tx.candidate.update({
      where: { id },
      data: { notes: removeNote(row.notes, nid) },
    });
  });
  revalidatePath("/candidates");
}

const optionalTrimmed = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const createSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: optionalTrimmed,
  email: optionalTrimmed.pipe(z.email("Invalid email").optional()),
  mobileNumber: optionalTrimmed,
  position: z.enum(POSITIONS),
  jobRole: optionalTrimmed,
  location: optionalTrimmed,
  portfolio: optionalTrimmed.pipe(
    z
      .string()
      .regex(/^https?:\/\//i, "Must start with http:// or https://")
      .optional(),
  ),
  status: z.enum(CANDIDATE_STATUSES),
});

const RESUME_EXTENSIONS = /\.(pdf|doc|docx)$/i;
// Under the 5 MB server-action limit and Vercel's 4.5 MB request body cap.
const MAX_RESUME_BYTES = 4 * 1024 * 1024;

/** HR-entered candidate (referral, walk-in…), optionally with a resume. */
export async function createCandidate(
  _prev: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  await requireRole("HR_ADMIN");
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(createSchema.shape)) {
    raw[key] = formData.get(key) ?? "";
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const resume = formData.get("resume");
  let fileUrl: string | undefined;
  if (resume instanceof File && resume.size > 0) {
    if (!RESUME_EXTENSIONS.test(resume.name)) {
      return { fieldErrors: { resume: ["Resume must be PDF, DOC or DOCX"] } };
    }
    if (resume.size > MAX_RESUME_BYTES) {
      return { fieldErrors: { resume: ["Resume must be under 4 MB"] } };
    }
    fileUrl = await uploadResume(parsed.data.firstName, resume);
  }

  await db.candidate.create({
    data: { ...parsed.data, fileUrl, sourceUrl: MANUAL_SOURCE, honeypot: "" },
  });
  revalidatePath("/candidates");
  return { ok: true };
}
