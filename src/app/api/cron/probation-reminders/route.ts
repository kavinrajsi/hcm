import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { probationReminderEmail } from "@/lib/emails";

// Daily Vercel cron: reminds HR of probation confirmations due within 14
// days. Protected by CRON_SECRET (Vercel sends it as a Bearer token).
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
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
          to: hrAdmins.map((u) => u.email),
          ...probationReminderEmail({
            rows: due.map((r) => ({
              name: r.employee.name,
              empId: r.employee.empId,
              dueDate: r.dueDate.toISOString(),
              status: r.status,
            })),
          }),
        });
        emailed = !result.skipped;
      } catch (e) {
        console.error("[probation-reminders] email failed", e);
      }
    }
  }

  return Response.json({ due: due.length, emailed });
}
