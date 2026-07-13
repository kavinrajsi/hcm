import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

// Daily Vercel cron: reminds HR of probation confirmations due within 14
// days. Protected by CRON_SECRET (Vercel sends it as a Bearer token).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const soon = new Date();
  soon.setDate(soon.getDate() + 14);

  const due = await db.probationRecord.findMany({
    where: { status: { not: "CONFIRMED" }, dueDate: { lte: soon } },
    include: { employee: { select: { empId: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });

  if (due.length > 0) {
    const hrAdmins = await db.user.findMany({
      where: { role: "HR_ADMIN" },
      select: { email: true },
    });
    const rows = due
      .map(
        (r) =>
          `<li>${r.employee.name} (${r.employee.empId}) — due ${r.dueDate.toISOString().slice(0, 10)} [${r.status}]</li>`,
      )
      .join("");
    await sendEmail({
      to: hrAdmins.map((u) => u.email),
      subject: `Probation confirmations due: ${due.length}`,
      html: `<p>Probation confirmations due within 14 days:</p><ul>${rows}</ul>`,
    });
  }

  return Response.json({ due: due.length });
}
