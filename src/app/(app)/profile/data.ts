import { cache } from "react";
import { db } from "@/lib/db";
import { myEmployeeId } from "@/lib/my-employee";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/rbac";

// Shared by the Profile sub-pages: the signed-in person's employee record
// (see myEmployeeId), resolved once per request.

const resolveEmployeeId = cache((userId: string, email: string) => myEmployeeId({ id: userId, email }));

/** The caller's employee record with just the relations a page needs. */
export async function myEmployee<Include extends Prisma.EmployeeInclude>(
  user: SessionUser,
  include: Include,
) {
  const id = await resolveEmployeeId(user.id, user.email);
  if (!id) return null;
  return db.employee.findUnique({ where: { id }, include });
}
