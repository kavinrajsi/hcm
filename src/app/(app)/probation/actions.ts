"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { confirmProbationRecord, extendProbationRecord } from "@/lib/hcm-ops";
import { requireRole } from "@/lib/rbac";

export async function confirmProbation(formData: FormData) {
  await requireRole("HR_ADMIN");
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Missing id");

  await confirmProbationRecord(id);

  revalidatePath("/probation");
  revalidatePath("/employees");
}

const extendSchema = z.object({
  id: z.string().min(1),
  extendedTo: z.string().min(1),
  notes: z.string().optional(),
});

export async function extendProbation(formData: FormData) {
  await requireRole("HR_ADMIN");
  const parsed = extendSchema.parse({
    id: formData.get("id"),
    extendedTo: formData.get("extendedTo"),
    notes: formData.get("notes") ?? undefined,
  });

  await extendProbationRecord(
    parsed.id,
    new Date(parsed.extendedTo),
    parsed.notes,
  );

  revalidatePath("/probation");
}
