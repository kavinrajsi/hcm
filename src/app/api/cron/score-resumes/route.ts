import type { NextRequest } from "next/server";
import { inNightWindow, isAuthorizedCron } from "@/lib/cron-auth";
import { scorePending } from "@/lib/candidates/score";

// Every 15 minutes overnight (02:00–08:00 IST): score new applications (and
// retry failed or credit-parked scores), ready for HR in the morning.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  if (!inNightWindow()) return Response.json({ skipped: "outside 02:00–08:00 IST" });
  // Up to 12 per run, 15 s apart: the gateway allows 5 Google requests a
  // minute, shared with the leave sync. ~24 runs a night covers a day's
  // applications plus backlog.
  const counts = await scorePending({ limit: 12, deadline: Date.now() + 200_000, trigger: "cron" });
  return Response.json(counts);
}
