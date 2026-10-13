import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { syncAllChats } from "@/lib/chat/sync";
import { withCronRun } from "@/lib/status/cron-runs";

export const maxDuration = 300;

// Every 5 minutes: new Basecamp chat lines in every project chat, so the
// Chat page's list stays current (the open chat refreshes itself every few
// seconds). Basecamp has no webhooks for chat. Protected by CRON_SECRET.
async function run(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    return Response.json(await syncAllChats());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 503 },
    );
  }
}

// Each run is recorded for the Status page.
export const GET = withCronRun("/api/cron/chat-sync", run);
