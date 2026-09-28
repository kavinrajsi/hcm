import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { syncBasecampPeople } from "@/lib/basecamp-people";

export const maxDuration = 300;

// Daily Vercel cron: links Basecamp people to employees and refreshes their
// profile pictures. Protected by CRON_SECRET (sent as a Bearer token).
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await syncBasecampPeople();
    return Response.json({ ...result, unmatched: result.unmatched.length });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 503 },
    );
  }
}
