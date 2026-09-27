"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendEmail } from "@/lib/email";
import {
  createPasswordLink,
  INVITE_TTL_MS,
  RESET_TTL_MS,
} from "@/lib/password-links";
import type { Role } from "@/generated/prisma/enums";

const ROLES = ["HR_ADMIN", "MANAGER", "EMPLOYEE"] as const;

export type LinkState = {
  error?: string;
  link?: string;
  emailed?: boolean;
  email?: string;
};

/** Emails a set-password link; false when email isn't configured or fails. */
async function mailLink(
  to: string,
  link: string,
  invite: boolean,
): Promise<boolean> {
  try {
    const result = await sendEmail({
      to,
      subject: invite ? "Your HRM account" : "Reset your HRM password",
      html: invite
        ? `<p>An account has been created for you on HRM.</p><p><a href="${link}">Set your password</a> — the link expires in 7 days.</p>`
        : `<p><a href="${link}">Set a new HRM password</a> — the link expires in 1 hour.</p>`,
    });
    return !result.skipped;
  } catch (e) {
    console.error("[users] email failed", e);
    return false;
  }
}

/** Other active HR admins besides `userId` — the app must never lose its last one. */
async function otherActiveAdmins(userId: string): Promise<number> {
  return db.user.count({
    where: { role: "HR_ADMIN", disabledAt: null, NOT: { id: userId } },
  });
}

const inviteSchema = z.object({
  employeeId: z.string().optional(),
  email: z.string().trim().optional(),
  name: z.string().trim().optional(),
  role: z.enum(ROLES),
});

/** Creates a login (optionally linked to an employee) and returns its invite link. */
export async function inviteUser(
  _prev: LinkState,
  formData: FormData,
): Promise<LinkState> {
  await requireRole("HR_ADMIN");
  const parsed = inviteSchema.safeParse({
    employeeId: formData.get("employeeId") || undefined,
    email: formData.get("email") || undefined,
    name: formData.get("name") || undefined,
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: "Pick a role" };
  const { employeeId, role } = parsed.data;

  let email = parsed.data.email?.toLowerCase();
  let name = parsed.data.name;
  if (employeeId) {
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { workEmail: true, name: true, userId: true, dateOfExit: true },
    });
    if (!employee) return { error: "Employee not found" };
    if (employee.userId) return { error: "This employee already has a login" };
    if (employee.dateOfExit) return { error: "This employee has exited" };
    email = employee.workEmail.toLowerCase();
    name = employee.name;
  }
  if (!email || !z.email().safeParse(email).success) {
    return { error: "Pick an employee or enter a valid email" };
  }
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    return { error: "An account with this email already exists" };
  }

  const user = await db.user.create({
    data: {
      email,
      name,
      role,
      // Link now; /me would otherwise link by work email on first visit.
      ...(employeeId ? { employee: { connect: { id: employeeId } } } : {}),
    },
  });
  const link = await createPasswordLink(user.id, {
    ttlMs: INVITE_TTL_MS,
    invite: true,
  });
  const emailed = await mailLink(email, link, true);

  revalidatePath("/users");
  return { link, emailed, email };
}

/** Fresh set-password link: an invite if they never set one, else a reset. */
export async function newPasswordLink(userId: string): Promise<LinkState> {
  await requireRole("HR_ADMIN");
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  if (!user) return { error: "User not found" };
  const invite = !user.passwordHash;
  const link = await createPasswordLink(userId, {
    ttlMs: invite ? INVITE_TTL_MS : RESET_TTL_MS,
    invite,
  });
  const emailed = await mailLink(user.email, link, invite);
  return { link, emailed, email: user.email };
}

export async function setUserRole(
  userId: string,
  role: Role,
): Promise<{ error?: string }> {
  await requireRole("HR_ADMIN");
  const next = z.enum(ROLES).parse(role);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return { error: "User not found" };
  if (
    user.role === "HR_ADMIN" &&
    next !== "HR_ADMIN" &&
    (await otherActiveAdmins(userId)) === 0
  ) {
    return { error: "Keep at least one active HR admin" };
  }
  await db.user.update({ where: { id: userId }, data: { role: next } });
  revalidatePath("/users");
  return {};
}

export async function setUserDisabled(
  userId: string,
  disabled: boolean,
): Promise<{ error?: string }> {
  const me = await requireRole("HR_ADMIN");
  if (disabled && userId === me.id) {
    return { error: "You can't disable your own account" };
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return { error: "User not found" };
  if (
    disabled &&
    user.role === "HR_ADMIN" &&
    (await otherActiveAdmins(userId)) === 0
  ) {
    return { error: "Keep at least one active HR admin" };
  }
  await db.user.update({
    where: { id: userId },
    data: { disabledAt: disabled ? new Date() : null },
  });
  revalidatePath("/users");
  return {};
}
