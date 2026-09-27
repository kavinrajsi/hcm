import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/rbac";
import { authorizeUrl, basecampConfigured } from "@/lib/basecamp";

export async function GET(req: NextRequest) {
  // Signed out → login page; signed in without HR → 403 (not a 500).
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "HR_ADMIN")
    return new Response("Forbidden", { status: 403 });
  if (!basecampConfigured()) {
    return new Response("Basecamp OAuth not configured", { status: 503 });
  }
  redirect(authorizeUrl(req.nextUrl.origin));
}
