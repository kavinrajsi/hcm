import type { NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { db } from "@/lib/db";

// Daily: the Email log keeps one year.
export const RETENTION_DAYS = 365;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  const before = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const { count } = await db.emailLog.deleteMany({ where: { createdAt: { lt: before } } });
  return Response.json({ deleted: count, before: before.toISOString() });
}
