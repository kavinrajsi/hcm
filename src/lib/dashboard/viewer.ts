// Dashboard: the signed-in user as widgets see them (role plus the employee
// and Basecamp ids that scope "my own" data).

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import type { Viewer } from "./sources";

export async function viewerFor(user: Pick<SessionUser, "id" | "role">): Promise<Viewer> {
  const employee = await db.employee.findUnique({
    where: { userId: user.id },
    select: { id: true, basecampPersonId: true },
  });
  return {
    id: user.id,
    role: user.role,
    employeeId: employee?.id ?? null,
    basecampPersonId: employee?.basecampPersonId ?? null,
  };
}
