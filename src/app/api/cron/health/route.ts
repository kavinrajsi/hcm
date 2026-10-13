import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runAllChecks } from "@/lib/status/checks";
import { HISTORY_DAYS } from "@/lib/status/services";

export const maxDuration = 60;

// Every 5 minutes, all day: checks every service HCM depends on and stores
// the result for the public Status page (/status). Keeps 95 days.
// Protected by CRON_SECRET.

const KEEP_DAYS = HISTORY_DAYS + 5;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date();
  const results = await runAllChecks(now);
  await db.healthCheck.createMany({
    data: Object.entries(results).map(([service, result]) => ({
      service,
      checkedAt: now,
      status: result.status,
      latencyMs: result.latencyMs,
      detail: result.detail,
    })),
  });
  const { count: pruned } = await db.healthCheck.deleteMany({
    where: { checkedAt: { lt: new Date(now.getTime() - KEEP_DAYS * 86_400_000) } },
  });
  return Response.json({
    checked: Object.fromEntries(Object.entries(results).map(([service, result]) => [service, result.status])),
    pruned,
  });
}
