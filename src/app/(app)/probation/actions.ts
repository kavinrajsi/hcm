"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

export async function confirmProbation(formData: FormData) {
  await requireRole("HR_ADMIN");
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Missing id");

  await db.$transaction(async (tx) => {
    const record = await tx.probationRecord.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    // Confirmation promotes the employee to permanent.
    await tx.employee.update({
      where: { id: record.employeeId },
      data: { empType: "PERMANENT" },
    });
  });

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

  const extendedTo = new Date(parsed.extendedTo);
  await db.probationRecord.update({
    where: { id: parsed.id },
    data: {
      status: "EXTENDED",
      extendedTo,
      // The new due date is the extension date — it re-enters the due list.
      dueDate: extendedTo,
      notes: parsed.notes || undefined,
    },
  });

  revalidatePath("/probation");
}
