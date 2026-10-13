import { NextResponse, type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/rbac";
import { authorizeUrl, basecampConfigured } from "@/lib/basecamp";
import {
  newState,
  RETURN_COOKIE,
  safeReturnPath,
  STATE_COOKIE,
  STATE_MAX_AGE_S,
} from "@/lib/basecamp-oauth-state";

export async function GET(request: NextRequest) {
  // Signed out → login page; employees → 403 (not a 500). HR connect for
  // the syncs; managers connect to reply in Chat as themselves.
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "HR_ADMIN" && user.role !== "MANAGER")
    return new Response("Forbidden", { status: 403 });
  if (!basecampConfigured()) {
    return new Response("Basecamp OAuth not configured", { status: 503 });
  }

  const state = newState();
  const response = NextResponse.redirect(authorizeUrl(request.nextUrl.origin, state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    // Lax: the browser still sends it when Basecamp redirects back.
    sameSite: "lax",
    path: "/api/basecamp/callback",
    maxAge: STATE_MAX_AGE_S,
  });
  response.cookies.set(RETURN_COOKIE, safeReturnPath(request.nextUrl.searchParams.get("returnTo")), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/basecamp/callback",
    maxAge: STATE_MAX_AGE_S,
  });
  return response;
}
