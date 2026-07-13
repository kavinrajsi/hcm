import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/rbac";
import { exchangeCode, fetchAccountId, saveToken } from "@/lib/basecamp";

export async function GET(req: NextRequest) {
  const user = await requireRole("HR_ADMIN");

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return new Response("Missing code", { status: 400 });

  const token = await exchangeCode(code);
  const accountId = await fetchAccountId(token.access_token);
  await saveToken(user.id, token, accountId);

  redirect("/quantum?connected=1");
}
