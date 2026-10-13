"use server";

// Quantum Sheet: "Your hours" logs time on a to-do assigned to you. (Sync
// from Basecamp streams through /api/quantum/sync.)

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fieldError, invalid, type FormState } from "@/lib/form-state";
import { requireUser } from "@/lib/rbac";
import { myEmployeeId } from "@/lib/my-employee";
import { istDay } from "@/lib/date-filter";
import { hoursToMinutes } from "@/lib/quantum/todos";

const hoursSchema = z.object({
  todoId: z.string().min(1),
  // Blank or 0 clears your hours.
  hours: z.coerce
    .number({ error: "Enter hours as a number" })
    .min(0, "Hours can't be negative")
    .max(200, "That's more than 200 hours"),
});

export type QuantumHoursState = FormState;

/** Your own total hours on a to-do assigned to you (no Basecamp hours on it). */
export async function logQuantumHours(
  _prev: QuantumHoursState,
  formData: FormData,
): Promise<QuantumHoursState> {
  const user = await requireUser();
  const parsed = hoursSchema.safeParse({
    todoId: formData.get("todoId"),
    hours: formData.get("hours") || 0,
  });
  if (!parsed.success) return invalid(parsed.error);

  const employeeId = await myEmployeeId(user);
  const employee = employeeId
    ? await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, basecampPersonId: true } })
    : null;
  if (!employee?.basecampPersonId) {
    return { error: "Your Basecamp account isn't linked to your HCM record. Ask HR." };
  }
  const todo = await db.quantumTodo.findUnique({
    where: { basecampId: parsed.data.todoId },
    select: { basecampId: true, assigneeIds: true },
  });
  if (!todo || !todo.assigneeIds.includes(employee.basecampPersonId)) {
    return { error: "You can only log hours on to-dos assigned to you." };
  }
  const fromBasecamp = await db.quantumHours.count({
    where: { todoBasecampId: todo.basecampId, source: "basecamp" },
  });
  if (fromBasecamp > 0) {
    return fieldError("hours", "This to-do's hours come from Basecamp's timesheet.");
  }

  const minutes = hoursToMinutes(parsed.data.hours);
  const key = { todoBasecampId_employeeId: { todoBasecampId: todo.basecampId, employeeId: employee.id } };
  if (minutes === 0) {
    await db.quantumHours.deleteMany({ where: { todoBasecampId: todo.basecampId, employeeId: employee.id } });
  } else {
    const date = new Date(`${istDay()}T00:00:00Z`);
    await db.quantumHours.upsert({
      where: key,
      create: { todoBasecampId: todo.basecampId, employeeId: employee.id, source: "hcm", date, minutes },
      update: { minutes, date },
    });
  }
  revalidatePath("/quantum");
  return { ok: true };
}
