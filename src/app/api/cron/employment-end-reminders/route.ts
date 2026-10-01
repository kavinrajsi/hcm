import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendEndReminders } from "@/lib/employment-emails";

// Daily Vercel cron: emails hr@madarth.com once, a week ahead, about each
// probation confirmation, contract end and internship end. ?dryRun=1 lists
// what it would send without sending or recording. CRON_SECRET protected.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const { rows, emailed } = await sendEndReminders({ dryRun });
    return Response.json({
      dryRun,
      emailed,
      due: rows.map((row) => ({
        empId: row.empId,
        name: row.name,
        kind: row.kind,
        endsOn: row.endsOn.toISOString().slice(0, 10),
        daysLeft: row.daysLeft,
      })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
