import { db } from "@/lib/db";

/**
 * The signed-in person's employee record: the one linked to their login,
 * else an unlinked record with their work email — which is then linked.
 * Never a record already linked to another login, so editing someone's
 * work email can't show (or let anyone act on) another person's record.
 */
export async function myEmployeeId(user: { id: string; email: string }): Promise<string | null> {
  const linked = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (linked) return linked.id;

  const unlinked = await db.employee.findFirst({
    where: { userId: null, workEmail: { equals: user.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!unlinked) return null;
  // Only if still unlinked (two first visits at once link it once).
  const { count } = await db.employee.updateMany({
    where: { id: unlinked.id, userId: null },
    data: { userId: user.id },
  });
  if (count === 1) return unlinked.id;
  const now = await db.employee.findUnique({ where: { id: unlinked.id }, select: { userId: true } });
  return now?.userId === user.id ? unlinked.id : null;
}
