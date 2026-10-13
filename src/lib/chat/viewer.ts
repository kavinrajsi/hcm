// Chat page: the viewer's Basecamp person id (their own messages sit on the
// right and don't count as unread), from their linked employee record.

import { db } from "@/lib/db";
import { myEmployeeId } from "@/lib/my-employee";

export async function myBasecampPersonId(user: { id: string; email: string }): Promise<string | null> {
  const employeeId = await myEmployeeId(user);
  if (!employeeId) return null;
  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { basecampPersonId: true } });
  return employee?.basecampPersonId ?? null;
}
