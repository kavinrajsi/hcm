"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";

export type ProfileFormState = { error?: string; ok?: boolean };

const nameSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export async function updateAccountName(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();

  const parsed = nameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }

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
      .transform((v) => (v === "" ? undefined : v))
      .optional(),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
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
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  // Accounts with a password must prove the current one; SSO-only
  // accounts are setting a password for the first time.
  if (account?.passwordHash) {
    if (!parsed.data.currentPassword) {
      return { error: "Current password is required" };
    }
    const valid = await bcrypt.compare(
      parsed.data.currentPassword,
      account.passwordHash,
    );
    if (!valid) return { error: "Current password is incorrect" };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) },
  });
  return { ok: true };
}
