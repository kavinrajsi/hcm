// Chat page: which Basecamp person is "me" — their messages sit on the right
// and don't count as unread. First the person behind the viewer's own
// Basecamp connection (that's who their replies post as; it's asked from
// Basecamp once and remembered), else their linked employee record.

import { db } from "@/lib/db";
import { getAccessToken } from "@/lib/basecamp";
import { myEmployeeId } from "@/lib/my-employee";

async function connectedPersonId(userId: string): Promise<string | null> {
  const row = await db.basecampToken.findUnique({ where: { userId }, select: { personId: true } });
  if (!row) return null;
  if (row.personId) return row.personId;
  try {
    const token = await getAccessToken(userId);
    if (!token) return null;
    const response = await fetch(`https://3.basecampapi.com/${token.accountId}/my/profile.json`, {
      headers: { Authorization: `Bearer ${token.accessToken}`, "User-Agent": "HCM Chat (internal)" },
    });
    if (!response.ok) return null;
    const personId = String(((await response.json()) as { id: number }).id);
    await db.basecampToken.update({ where: { userId }, data: { personId } });
    return personId;
  } catch {
    // Basecamp unreachable: fall back to the employee record this time.
    return null;
  }
}

export async function myBasecampPersonId(user: { id: string; email: string }): Promise<string | null> {
  const fromConnection = await connectedPersonId(user.id);
  if (fromConnection) return fromConnection;
  const employeeId = await myEmployeeId(user);
  if (!employeeId) return null;
  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { basecampPersonId: true } });
  return employee?.basecampPersonId ?? null;
}
