// Status page: records each scheduled job's run in CronRun (when it ran,
// whether it worked) without changing what the job does or returns. Only
// real runs count: requests without the cron secret and runs that skip
// themselves (outside their window) aren't recorded.

import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

type Handler = (request: NextRequest) => Promise<Response>;

/** Whether a finished run counts as a run (not a "skipped" reply). */
async function wasSkipped(response: Response): Promise<boolean> {
  if (!response.headers.get("content-type")?.includes("json")) return false;
  try {
    const body = (await response.clone().json()) as { skipped?: unknown };
    return Boolean(body && typeof body === "object" && "skipped" in body);
  } catch {
    return false;
  }
}

async function save(run: { path: string; startedAt: Date; ok: boolean; error: string | null }) {
  // Tests never touch the database; recording is a production concern.
  if (process.env.NODE_ENV === "test") return;
  try {
    // Loaded here, not at the top: every cron route imports this file, and
    // their tests don't load the database.
    const { db } = await import("@/lib/db");
    await db.cronRun.create({ data: { ...run, finishedAt: new Date() } });
  } catch (error) {
    // A recording problem must never fail the job itself.
    console.error("[cron-runs] couldn't record", run.path, error instanceof Error ? error.message : error);
  }
}

export function withCronRun(path: string, handler: Handler): Handler {
  return async (request) => {
    if (!isAuthorizedCron(request)) return handler(request);
    const startedAt = new Date();
    try {
      const response = await handler(request);
      if (!(await wasSkipped(response))) {
        await save({
          path,
          startedAt,
          ok: response.status < 400,
          error: response.status < 400 ? null : `HTTP ${response.status}`,
        });
      }
      return response;
    } catch (error) {
      await save({ path, startedAt, ok: false, error: error instanceof Error ? error.message.slice(0, 500) : "failed" });
      throw error;
    }
  };
}
