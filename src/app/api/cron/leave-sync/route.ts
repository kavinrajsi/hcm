import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { leaveSyncUserId, syncLeaveFromBasecamp } from "@/lib/leave-sync";
import { withCronRun } from "@/lib/status/cron-runs";

export const maxDuration = 300;

// Daily Vercel cron: syncs the Basecamp leave and WFH check-ins.
// Uses the Basecamp token of the most recently connected HR admin.
// Protected by CRON_SECRET (Vercel sends it as a Bearer token).
async function run(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = await leaveSyncUserId();
  if (!userId) {
    return Response.json(
      { error: "No HR admin has connected Basecamp" },
      { status: 503 },
    );
  }

  const result = await syncLeaveFromBasecamp(userId, "cron");
  return Response.json(result);
}

// Each run is recorded for the Status page.
export const GET = withCronRun("/api/cron/leave-sync", run);
