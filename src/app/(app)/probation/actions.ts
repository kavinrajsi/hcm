"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { confirmProbationRecord, extendProbationRecord } from "@/lib/hcm-ops";
import { requireRole } from "@/lib/rbac";
import { invalid, type FormState } from "@/lib/form-state";

export async function confirmProbation(formData: FormData) {
  await requireRole("HR_ADMIN");
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Missing id");

  await confirmProbationRecord(id);

  revalidatePath("/probation");
  revalidatePath("/employees");
}

const extendSchema = z.object({
  id: z.string().min(1, "Missing probation record"),
  extendedTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date to extend to"),
  notes: z.string().optional(),
});

export type ProbationFormState = FormState;

export async function extendProbation(
  _prev: ProbationFormState,
  formData: FormData,
): Promise<ProbationFormState> {
  await requireRole("HR_ADMIN");
  const parsed = extendSchema.safeParse({
    id: formData.get("id") ?? "",
    extendedTo: formData.get("extendedTo") ?? "",
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) return invalid(parsed.error);

  await extendProbationRecord(
    parsed.data.id,
    new Date(parsed.data.extendedTo),
    parsed.data.notes,
  );

  revalidatePath("/probation");
  return { ok: true };
}
