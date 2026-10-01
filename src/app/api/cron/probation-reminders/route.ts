import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { probationReminderEmail } from "@/lib/emails";

// Daily Vercel cron: reminds HR of probation confirmations due within 14
// days. Protected by CRON_SECRET (Vercel sends it as a Bearer token).
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const soon = new Date();
  soon.setDate(soon.getDate() + 14);

  const due = await db.probationRecord.findMany({
    where: {
      status: { notIn: ["CONFIRMED", "EXITED"] },
      dueDate: { lte: soon },
    },
    include: { employee: { select: { empId: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });

  let emailed = false;
  if (due.length > 0) {
    // Active HR admins only — not disabled accounts.
    const hrAdmins = await db.user.findMany({
      where: { role: "HR_ADMIN", disabledAt: null },
      select: { email: true },
    });
    if (hrAdmins.length > 0) {
      try {
        const result = await sendEmail({
          kind: "probation-digest",
          to: hrAdmins.map((admin) => admin.email),
          ...probationReminderEmail({
            rows: due.map((record) => ({
              name: record.employee.name,
              empId: record.employee.empId,
              dueDate: record.dueDate.toISOString(),
              status: record.status,
            })),
          }),
        });
        emailed = !result.skipped;
      } catch (error) {
        console.error("[probation-reminders] email failed", error);
      }
    }
  }

  return Response.json({ due: due.length, emailed });
}
