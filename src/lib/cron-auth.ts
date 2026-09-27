import type { NextRequest } from "next/server";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The secret is
 * required: without it the job routes refuse every request, so a missing
 * env var can't leave them open to the internet.
 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}
