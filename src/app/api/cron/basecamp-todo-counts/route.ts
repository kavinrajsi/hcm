import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { syncOpenTodoCounts } from "@/lib/basecamp-todo-counts";

export const maxDuration = 300;

// Every-30-minutes Vercel cron: each employee's open Basecamp to-dos (with
// and without a due date) for the Staff page. Protected by CRON_SECRET.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    return Response.json(await syncOpenTodoCounts());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 503 },
    );
  }
}
