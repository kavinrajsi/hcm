import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { syncQuantumTodos } from "@/lib/quantum/sync";
import { withCronRun } from "@/lib/status/cron-runs";

export const maxDuration = 300;

// Daily 04:45 IST: Basecamp to-dos changed since the last run, for the
// Quantum Sheet. HR and managers can also sync from the page during the day.
// Protected by CRON_SECRET.
async function run(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    return Response.json(await syncQuantumTodos());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 503 },
    );
  }
}

// Each run is recorded for the Status page.
export const GET = withCronRun("/api/cron/quantum-sync", run);
