import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/rbac";
import { canReadFile, signedReadUrl } from "@/lib/learning/files";

// A course file for someone who can open that course: redirect to a
// short-lived signed Blob URL (the CDN serves byte ranges, so videos seek).
// ?download=1 asks the browser to save it instead of showing it.

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/learning/files/[...path]">,
) {
  const { path } = await ctx.params;
  const key = path.map(decodeURIComponent).join("/");
  const user = await requireUser();
  if (!(await canReadFile(user, key))) {
    return new Response("Forbidden", { status: 403 });
  }
  const url = await signedReadUrl(key, {
    download: request.nextUrl.searchParams.get("download") === "1",
  });
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "private, no-store" },
  });
}
