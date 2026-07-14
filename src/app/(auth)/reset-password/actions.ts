"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export type ResetFormState = { error?: string; ok?: boolean };

const resetSchema = z
  .object({
    token: z.string().min(1, "Reset link is invalid"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function resetPassword(
  _prev: ResetFormState,
  formData: FormData,
): Promise<ResetFormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const tokenHash = createHash("sha256")
    .update(parsed.data.token)
    .digest("hex");
  const token = await db.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!token) {
    return { error: "This reset link is invalid or has expired" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db.$transaction([
    db.user.update({
      where: { id: token.userId },
      data: { passwordHash },
    }),
    db.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    }),
    db.passwordResetToken.deleteMany({
      where: { userId: token.userId, usedAt: null },
    }),
  ]);

  return { ok: true };
}
