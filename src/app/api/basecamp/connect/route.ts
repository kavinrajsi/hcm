import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/rbac";
import { authorizeUrl, basecampConfigured } from "@/lib/basecamp";

export async function GET(req: NextRequest) {
  await requireRole("HR_ADMIN");
  if (!basecampConfigured()) {
    return new Response("Basecamp OAuth not configured", { status: 503 });
  }
  redirect(authorizeUrl(req.nextUrl.origin));
}
