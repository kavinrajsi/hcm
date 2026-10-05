import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { probationReminderEmail } from "@/lib/emails";
import { istDay } from "@/lib/date-filter";
import { HR_EMAIL } from "@/lib/employment-emails";

// Weekly (Monday 09:00 IST) Vercel cron: overdue probation confirmations,
// to the HR inbox. Upcoming ones are covered once, a week ahead, by the
// "ending within a week" reminder (employment-end-reminders), so this only
// lists what has passed its due date and is still open — nothing is sent
// when there's none. Protected by CRON_SECRET (Vercel's Bearer token).
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const today = new Date(`${istDay()}T00:00:00Z`);
  const overdue = await db.probationRecord.findMany({
    where: {
      status: { in: ["PENDING", "EXTENDED"] },
      dueDate: { lt: today },
      employee: { dateOfExit: null },
    },
    include: { employee: { select: { empId: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });

  let emailed = false;
  if (overdue.length > 0) {
    try {
      const result = await sendEmail({
        kind: "probation-digest",
        to: HR_EMAIL,
        ...probationReminderEmail({
          rows: overdue.map((record) => ({
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

  return Response.json({ overdue: overdue.length, emailed });
}
