import type { NextRequest } from "next/server";
import { readDocument } from "@/lib/blob";
import { AuthorizationError, requireRole } from "@/lib/rbac";

// Streams private employee documents after an RBAC check. Documents are
// HR-only for now; per-employee self-service access can be layered on by
// checking blob-key ownership against the caller's employee record.
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/files/[...path]">,
) {
  try {
    await requireRole("HR_ADMIN");
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return new Response("Forbidden", { status: 403 });
    }
    throw e;
  }

  const { path } = await ctx.params;
  const result = await readDocument(path.join("/"));
  if (!result) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(result.stream, {
    headers: Object.fromEntries(result.headers.entries()),
  });
}
