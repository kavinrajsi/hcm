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

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw new AuthorizationError("Not signed in");
  }
  return {
    id: session.user.id,
    role: session.user.role,
    email: session.user.email,
  };
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
