"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { CANDIDATE_STATUSES } from "./statuses";

const updateSchema = z.object({
  id: z.string().regex(/^\d+$/),
  status: z.enum(CANDIDATE_STATUSES),
  notes: z.string().trim().max(5000),
});

export type CandidateFormState = { error?: string; ok?: boolean };

export async function updateCandidate(
  _prev: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  await requireRole("HR_ADMIN");
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.candidate.update({
    where: { id: BigInt(parsed.data.id) },
    data: { status: parsed.data.status, notes: parsed.data.notes || null },
  });
  revalidatePath("/candidates");
  return { ok: true };
}
