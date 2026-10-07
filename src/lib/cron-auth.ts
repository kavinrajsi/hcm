import type { NextRequest } from "next/server";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The secret is
 * required: without it the job routes refuse every request, so a missing
 * env var can't leave them open to the internet.
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return (
    !!secret && request.headers.get("authorization") === `Bearer ${secret}`
  );
}

/**
 * Every job runs overnight, 02:00–08:00 IST (20:30–02:30 UTC). Cron syntax
 * can't express a window crossing midnight UTC exactly, so the frequent jobs
 * are scheduled a little wider and skip runs outside it.
 */
export function inNightWindow(now = new Date()): boolean {
  const istHour = new Date(now.getTime() + 330 * 60_000).getUTCHours();
  return istHour >= 2 && istHour < 8;
}
