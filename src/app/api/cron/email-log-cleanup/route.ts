import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { AUTH_ATTEMPT_RETENTION_MS } from "@/lib/auth-throttle";
import { SESSION_RETENTION_DAYS } from "@/lib/login-sessions";

// Daily: the Email log keeps one year; sign-in throttle rows keep one day;
// expired passkey challenges go; signed-in devices are listed for a year
// after last use.
export const RETENTION_DAYS = 365;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  const before = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const { count } = await db.emailLog.deleteMany({ where: { createdAt: { lt: before } } });
  await db.authAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - AUTH_ATTEMPT_RETENTION_MS) } },
  });
  await db.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.loginSession.deleteMany({
    where: { lastSeenAt: { lt: new Date(Date.now() - SESSION_RETENTION_DAYS * 86_400_000) } },
  });
  return Response.json({ deleted: count, before: before.toISOString() });
}
