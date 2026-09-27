import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/rbac";
import { exchangeCode, fetchAccountId, saveToken } from "@/lib/basecamp";

export async function GET(req: NextRequest) {
  // Signed out → login page; signed in without HR → 403 (not a 500).
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "HR_ADMIN")
    return new Response("Forbidden", { status: 403 });

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return new Response("Missing code", { status: 400 });

  const token = await exchangeCode(code, req.nextUrl.origin);
  const accountId = await fetchAccountId(token.access_token);
  await saveToken(user.id, token, accountId);

  redirect("/quantum?connected=1");
}
