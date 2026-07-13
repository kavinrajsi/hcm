"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendEmail } from "@/lib/email";

const exitSchema = z.object({
  employeeId: z.string().min(1),
  dateOfExit: z.string().min(1, "Exit date is required"),
});

export type ExitFormState = { error?: string; ok?: boolean };

export async function markExit(
  _prev: ExitFormState,
  formData: FormData,
): Promise<ExitFormState> {
  await requireRole("HR_ADMIN");

  const parsed = exitSchema.safeParse({
    employeeId: formData.get("employeeId"),
    dateOfExit: formData.get("dateOfExit"),
  });
  if (!parsed.success) return { error: "Employee and exit date are required" };

  const employee = await db.employee.findUnique({
    where: { id: parsed.data.employeeId },
    include: { idCard: true },
  });
  if (!employee) return { error: "Employee not found" };
  if (employee.dateOfExit) return { error: "Employee already marked as exited" };

  await db.$transaction([
    db.employee.update({
      where: { id: employee.id },
      data: { dateOfExit: new Date(parsed.data.dateOfExit) },
    }),
    // Auto-flag the ID card for return on exit.
    ...(employee.idCard && employee.idCard.status !== "RETURNED"
      ? [
          db.idCard.update({
            where: { id: employee.idCard.id },
            data: { status: "RETURN_PENDING" },
          }),
        ]
      : []),
  ]);

  await sendEmail({
    to: employee.workEmail,
    subject: `Exit clearance — ${employee.name} (${employee.empId})`,
    html: `<p>Exit recorded for <strong>${employee.name}</strong> (${employee.empId}) effective ${parsed.data.dateOfExit}.</p><p>Clearance checklist: return ID card, hand over assets, complete knowledge transfer.</p>`,
  });

  revalidatePath("/exit");
  revalidatePath("/id-cards");
  revalidatePath("/employees");
  return { ok: true };
}

export async function undoExit(formData: FormData) {
  await requireRole("HR_ADMIN");
  const employeeId = formData.get("employeeId");
  if (typeof employeeId !== "string") throw new Error("Missing employeeId");

  await db.employee.update({
    where: { id: employeeId },
    data: { dateOfExit: null },
  });
  revalidatePath("/exit");
  revalidatePath("/employees");
}
