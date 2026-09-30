import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { syncBasecampJobs } from "@/lib/assign/jobs-sync";
import { classifyPending } from "@/lib/assign/classify";

export const maxDuration = 300;

// Sync budget leaves the rest of the 300s for classifying what's new.
const SYNC_BUDGET_MS = 150_000;
const CLASSIFY_BUDGET_MS = 120_000;

// Daily Vercel cron: pulls new completed Basecamp to-dos and comments, then
// classifies job kinds and comment categories. Protected by CRON_SECRET.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const sync = await syncBasecampJobs(() => {}, { budgetMs: SYNC_BUDGET_MS });
    const classified = await classifyPending(CLASSIFY_BUDGET_MS, "cron");
    return Response.json({ sync, classified });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 503 },
    );
  }
}
