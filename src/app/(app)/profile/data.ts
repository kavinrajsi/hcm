import { cache } from "react";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/rbac";

// Shared by the Profile sub-pages: the signed-in person's employee record,
// found by link or work email, and linked on first sight.

const resolveEmployeeId = cache(async (userId: string, email: string) => {
  const employee = await db.employee.findFirst({
    where: { OR: [{ userId }, { workEmail: email }] },
    select: { id: true, userId: true },
  });
  if (!employee) return null;
  if (!employee.userId) {
    await db.employee.update({ where: { id: employee.id }, data: { userId } });
  }
  return employee.id;
});

/** The caller's employee record with just the relations a page needs. */
export async function myEmployee<Include extends Prisma.EmployeeInclude>(
  user: SessionUser,
  include: Include,
) {
  const id = await resolveEmployeeId(user.id, user.email);
  if (!id) return null;
  return db.employee.findUnique({ where: { id }, include });
}
