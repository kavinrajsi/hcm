import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

// Server-side authorization guards. Every Server Action and every Server
// Component data fetch calls one of these first — Server Actions are
// reachable via direct POST, so UI hiding is never the security boundary.

export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export type SessionUser = { id: string; role: Role; email: string };

/**
 * The signed-in user as the database has them now — so a role change or a
 * disabled account takes effect on the next request, not the next login.
 * Null when signed out or disabled. Cached per request.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, email: true, disabledAt: true },
  });
  if (!user || user.disabledAt) return null;
  return { id: user.id, role: user.role, email: user.email };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AuthorizationError("Not signed in");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthorizationError();
  }
  return user;
}

/**
 * Allow the employee who owns the record, or any of the given roles.
 * Used for self-service reads/updates of a user's own data.
 */
export async function requireSelfOrRole(
  employeeId: string,
  ...roles: Role[]
): Promise<SessionUser> {
  const user = await requireUser();
  if (roles.includes(user.role)) return user;
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { userId: true },
  });
  if (employee?.userId === user.id) return user;
  throw new AuthorizationError();
}
