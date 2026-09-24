import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { syncLeaveFromBasecamp } from "@/lib/leave-sync";

export const maxDuration = 300;

// Daily Vercel cron: syncs the Basecamp "Post your leave here" check-in.
// Uses the Basecamp token of the most recently connected HR admin.
// Protected by CRON_SECRET (Vercel sends it as a Bearer token).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const hrUsers = await db.user.findMany({
    where: { role: "HR_ADMIN" },
    select: { id: true },
  });
  const token = await db.basecampToken.findFirst({
    where: { userId: { in: hrUsers.map((u) => u.id) } },
    orderBy: { updatedAt: "desc" },
    select: { userId: true },
  });
  if (!token) {
    return Response.json(
      { error: "No HR admin has connected Basecamp" },
      { status: 503 },
    );
  }

  const result = await syncLeaveFromBasecamp(token.userId);
  return Response.json(result);
}
