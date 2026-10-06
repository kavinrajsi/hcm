import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { scorePending } from "@/lib/candidates/score";

// Every 15 minutes: score new applications (and retry failed scores) so HR
// sees a resume score on the Candidates page soon after someone applies.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  // Stop picking up new resumes well before the 300 s limit.
  const counts = await scorePending({ limit: 60, deadline: Date.now() + 200_000, trigger: "cron" });
  return Response.json(counts);
}
