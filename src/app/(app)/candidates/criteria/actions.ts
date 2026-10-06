"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { invalid, type FormState } from "@/lib/form-state";
import { requireRole } from "@/lib/rbac";
import { roleKey } from "@/lib/candidates/score-bands";

const criteriaSchema = z.object({
  role: z.string().trim().min(1).max(200),
  criteria: z.string().trim().max(4000),
});

/** Saves (or, when blank, clears) what HR looks for in a job role. */
export async function saveRoleCriteria(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("HR_ADMIN");
  const parsed = criteriaSchema.safeParse({ role: formData.get("role"), criteria: formData.get("criteria") ?? "" });
  if (!parsed.success) return invalid(parsed.error);
  const key = roleKey(parsed.data.role);
  if (!parsed.data.criteria) {
    await db.roleCriteria.deleteMany({ where: { roleKey: key } });
  } else {
    await db.roleCriteria.upsert({
      where: { roleKey: key },
      create: { roleKey: key, role: parsed.data.role, criteria: parsed.data.criteria, updatedById: user.id },
      update: { role: parsed.data.role, criteria: parsed.data.criteria, updatedById: user.id },
    });
  }
  revalidatePath("/candidates/criteria");
  return { ok: "Saved. Rescore candidates to apply it." };
}
