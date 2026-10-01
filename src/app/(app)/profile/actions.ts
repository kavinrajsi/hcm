"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { fieldError, invalid, type FormState } from "@/lib/form-state";
import { requireSelfOrRole, requireUser } from "@/lib/rbac";
import { contactSchema, saveContact } from "@/lib/hcm-ops";

export type ProfileFormState = FormState;

const nameSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export async function updateAccountName(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();

  const parsed = nameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return invalid(parsed.error);

  await db.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name },
  });
  revalidatePath("/profile");
  return { ok: true };
}

const passwordSchema = z
  .object({
    currentPassword: z
      .string()
      .transform((value) => (value === "" ? undefined : value))
      .optional(),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((passwords) => passwords.newPassword === passwords.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function changePassword(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  // Accounts with a password must prove the current one; SSO-only
  // accounts are setting a password for the first time.
  if (account?.passwordHash) {
    if (!parsed.data.currentPassword) {
      return fieldError("currentPassword", "Current password is required");
    }
    const valid = await bcrypt.compare(
      parsed.data.currentPassword,
      account.passwordHash,
    );
    if (!valid)
      return fieldError("currentPassword", "Current password is incorrect");
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) },
  });
  return { ok: true };
}

export type SelfUpdateState = FormState;

export async function updateOwnContact(
  employeeId: string,
  _prev: SelfUpdateState,
  formData: FormData,
): Promise<SelfUpdateState> {
  await requireSelfOrRole(employeeId, "HR_ADMIN");

  const parsed = contactSchema.safeParse({
    phone: formData.get("phone"),
    personalEmail: formData.get("personalEmail"),
    emergencyContact: formData.get("emergencyContact") ?? undefined,
    fatherName: formData.get("fatherName") ?? undefined,
    address: formData.get("address") ?? undefined,
    city: formData.get("city") ?? undefined,
    state: formData.get("state") ?? undefined,
    pincode: formData.get("pincode") ?? undefined,
  });
  if (!parsed.success) return invalid(parsed.error);

  await saveContact(employeeId, parsed.data);
  revalidatePath("/profile");
  return { ok: true };
}
