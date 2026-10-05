import { NextResponse, type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/rbac";
import { exchangeCode, fetchAccountId, saveToken } from "@/lib/basecamp";
import { STATE_COOKIE, stateMatches } from "@/lib/basecamp-oauth-state";

export async function GET(request: NextRequest) {
  // Signed out → login page; signed in without HR → 403 (not a 500).
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "HR_ADMIN")
    return new Response("Forbidden", { status: 403 });

  // Only a code from the round trip this browser started (see connect).
  const query = request.nextUrl.searchParams;
  if (!stateMatches(request.cookies.get(STATE_COOKIE)?.value, query.get("state"))) {
    return new Response("This Basecamp sign-in link expired or didn't start here. Connect Basecamp again.", {
      status: 400,
    });
  }
  const code = query.get("code");
  if (!code) return new Response("Missing code", { status: 400 });

  try {
    const token = await exchangeCode(code, request.nextUrl.origin);
    const accountId = await fetchAccountId(token.access_token);
    await saveToken(user.id, token, accountId);
  } catch (error) {
    console.error("[basecamp] connect failed", error);
    return new Response("Couldn't connect Basecamp. Try again.", { status: 502 });
  }

  const response = NextResponse.redirect(new URL("/quantum?connected=1", request.url));
  // One use only.
  response.cookies.delete({ name: STATE_COOKIE, path: "/api/basecamp/callback" });
  return response;
}
