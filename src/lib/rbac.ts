import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkAndTouch } from "@/lib/login-sessions";
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

export type SessionUser = {
  id: string;
  role: Role;
  email: string;
  /** This browser's LoginSession; absent for MCP (OAuth bearer) callers. */
  sessionId?: string;
};

/**
 * The signed-in user as the database has them now — so a role change or a
 * disabled account takes effect on the next request, not the next login.
 * Null when signed out, disabled, or this device was signed out (its
 * LoginSession revoked or idle 30 days; tokens from before devices were
 * tracked have none and must sign in again). Cached per request.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id || !session.sessionId) return null;
  const [user, live] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, email: true, disabledAt: true },
    }),
    checkAndTouch(session.sessionId, session.user.id),
  ]);
  if (!user || user.disabledAt || !live) return null;
  return { id: user.id, role: user.role, email: user.email, sessionId: session.sessionId };
});

/**
 * The signed-in user, or a redirect to /login. Redirecting (instead of
 * throwing) matters because Next renders layout and page in parallel: the
 * layout already sends signed-out visitors to /login, and a throw here would
 * only surface as a false "Not signed in" error in the server logs. Wrong
 * role is still an AuthorizationError (see requireRole).
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
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

/**
 * Page and layout versions of the guards: a wrong role renders the 403 page
 * (app/forbidden.tsx) instead of throwing, so it isn't logged as a server
 * error. Server Actions keep requireRole, whose throw callers catch.
 */
export async function requirePageRole(...roles: Role[]): Promise<SessionUser> {
  try {
    return await requireRole(...roles);
  } catch (error) {
    if (error instanceof AuthorizationError) forbidden();
    throw error;
  }
}

export async function requirePageSelfOrRole(
  employeeId: string,
  ...roles: Role[]
): Promise<SessionUser> {
  try {
    return await requireSelfOrRole(employeeId, ...roles);
  } catch (error) {
    if (error instanceof AuthorizationError) forbidden();
    throw error;
  }
}
