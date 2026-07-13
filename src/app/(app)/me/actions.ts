"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSelfOrRole } from "@/lib/rbac";

export type SelfUpdateState = { error?: string; ok?: boolean };

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

// Self-service scope: contact + address only. Everything else stays HR-only.
const selfSchema = z.object({
  phone: z.string().trim().min(7, "Phone is required"),
  personalEmail: z.string().trim().pipe(z.email("Invalid personal email")),
  emergencyContact: optional,
  address: optional,
  city: optional,
  state: optional,
  pincode: optional,
});

export async function updateOwnContact(
  employeeId: string,
  _prev: SelfUpdateState,
  formData: FormData,
): Promise<SelfUpdateState> {
  await requireSelfOrRole(employeeId, "HR_ADMIN");

  const parsed = selfSchema.safeParse({
    phone: formData.get("phone"),
    personalEmail: formData.get("personalEmail"),
    emergencyContact: formData.get("emergencyContact") ?? undefined,
    address: formData.get("address") ?? undefined,
    city: formData.get("city") ?? undefined,
    state: formData.get("state") ?? undefined,
    pincode: formData.get("pincode") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.employee.update({ where: { id: employeeId }, data: parsed.data });
  revalidatePath("/me");
  return { ok: true };
}
