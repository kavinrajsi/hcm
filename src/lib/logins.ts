import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { inviteEmail, resetEmail } from "@/lib/emails";
import { createPasswordLink, INVITE_TTL_MS } from "@/lib/password-links";
import type { Role } from "@/generated/prisma/enums";

// Creating sign-in accounts. Used by Users & roles, Add employee / CSV
// import (every new joiner gets an Employee login) and the employee page.

export type ProvisionResult =
  | { error: string }
  | { userId: string; link: string; emailed: boolean; email: string };

/** Emails a set-password link; false when email isn't configured or fails. */
export async function mailPasswordLink({
  to,
  link,
  invite,
  name,
}: {
  to: string;
  link: string;
  invite: boolean;
  name?: string | null;
}): Promise<boolean> {
  try {
    const email = invite
      ? inviteEmail({ name, email: to, link })
      : resetEmail({ link });
    const result = await sendEmail({ to, ...email });
    return !result.skipped;
  } catch (error) {
    console.error("[logins] email failed", error);
    return false;
  }
}

/**
 * Creates a login (linked to `employeeId` when given), makes a 7-day
 * set-password link and emails it. If an unlinked login with that email
 * already exists it is linked to the employee instead of duplicated.
 */
export async function provisionLogin({
  email,
  name,
  role,
  employeeId,
}: {
  email: string;
  name?: string;
  role: Role;
  employeeId?: string;
}): Promise<ProvisionResult> {
  const normalized = email.trim().toLowerCase();
  const existing = await db.user.findUnique({
    where: { email: normalized },
    select: { id: true, employee: { select: { id: true } } },
  });
  if (existing) {
    if (!employeeId || existing.employee) {
      return { error: "An account with this email already exists" };
    }
    await db.employee.update({
      where: { id: employeeId },
      data: { userId: existing.id },
    });
    return { error: "Linked to the existing account with this email" };
  }

  const user = await db.user.create({
    data: {
      email: normalized,
      name,
      role,
      ...(employeeId ? { employee: { connect: { id: employeeId } } } : {}),
    },
  });
  const link = await createPasswordLink(user.id, {
    ttlMs: INVITE_TTL_MS,
    invite: true,
  });
  const emailed = await mailPasswordLink({
    to: normalized,
    link,
    invite: true,
    name,
  });
  return { userId: user.id, link, emailed, email: normalized };
}
