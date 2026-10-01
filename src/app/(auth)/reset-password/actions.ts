"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { invalid, type FormState } from "@/lib/form-state";

export type ResetFormState = FormState;

const resetSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function resetPassword(
  _prev: ResetFormState,
  formData: FormData,
): Promise<ResetFormState> {
  // The token rides in a hidden input, so a bad one is the form's problem.
  const rawToken = formData.get("token");
  if (typeof rawToken !== "string" || !rawToken) {
    return { error: "This reset link is invalid or has expired" };
  }
  const parsed = resetSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const tokenHash = createHash("sha256")
    .update(rawToken)
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
