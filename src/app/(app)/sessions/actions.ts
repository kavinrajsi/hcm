"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/rbac";

export type SessionFormState = { error?: string; ok?: boolean };

const sessionSchema = z.object({
  name: z.string().trim().min(1, "Session name is required"),
  date: z.string().min(1, "Date is required"),
  trainer: z.string().trim().min(1, "Trainer is required"),
  mode: z.enum(["IN_PERSON", "VIRTUAL"]),
  notes: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});

export async function createSession(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  await requireRole("HR_ADMIN");
  const parsed = sessionSchema.safeParse({
    name: formData.get("name"),
    date: formData.get("date"),
    trainer: formData.get("trainer"),
    mode: formData.get("mode"),
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid session" };
  }

  await db.trainingSession.create({
    data: { ...parsed.data, date: new Date(parsed.data.date) },
  });
  revalidatePath("/sessions");
  return { ok: true };
}

/** Employees register themselves; HR can register anyone. */
export async function registerForSession(formData: FormData) {
  const user = await requireUser();
  const sessionId = formData.get("sessionId");
  let employeeId = formData.get("employeeId");
  if (typeof sessionId !== "string") throw new Error("Missing sessionId");

  if (user.role !== "HR_ADMIN" || typeof employeeId !== "string" || !employeeId) {
    // Self-registration: resolve the caller's employee record.
    const self = await db.employee.findFirst({
      where: { OR: [{ userId: user.id }, { workEmail: user.email }] },
      select: { id: true },
    });
    if (!self) throw new Error("No employee record linked to your account");
    employeeId = self.id;
  }

  await db.sessionRegistration.upsert({
    where: {
      sessionId_employeeId: { sessionId, employeeId },
    },
    update: {},
    create: { sessionId, employeeId },
  });
  revalidatePath("/sessions");
}

const attendanceSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  sessionId: z
    .string()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  sessionName: z.string().trim().min(1, "Session name is required"),
  date: z.string().min(1, "Date is required"),
  attended: z.coerce.boolean(),
  trainer: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  notes: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});

export async function logAttendance(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  await requireRole("HR_ADMIN");
  const parsed = attendanceSchema.safeParse({
    employeeId: formData.get("employeeId"),
    sessionId: formData.get("sessionId") ?? undefined,
    sessionName: formData.get("sessionName"),
    date: formData.get("date"),
    attended: formData.get("attended") === "on" ? "true" : "",
    trainer: formData.get("trainer") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid entry" };
  }

  await db.sessionAttendance.create({
    data: { ...parsed.data, date: new Date(parsed.data.date) },
  });
  revalidatePath("/sessions/attended");
  return { ok: true };
}
