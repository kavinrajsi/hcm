import type { NextRequest } from "next/server";
import { readDocument } from "@/lib/blob";
import { db } from "@/lib/db";
import { EMPLOYEE_DOCUMENTS } from "@/lib/employee-documents";
import { requireUser } from "@/lib/rbac";

// Streams private employee documents after an access check: HR admins read
// any document; everyone else only the files on their own employee record.

async function ownsDocument(userId: string, key: string): Promise<boolean> {
  const own = await db.employee.findFirst({
    where: {
      userId,
      OR: EMPLOYEE_DOCUMENTS.map(([column]) => ({ [column]: key })),
    },
    select: { id: true },
  });
  return own !== null;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/files/[...path]">,
) {
  const { path } = await ctx.params;
  const key = path.join("/");

  // Signed out → /login (requireUser); signed in without access → 403.
  const user = await requireUser();
  if (user.role !== "HR_ADMIN" && !(await ownsDocument(user.id, key))) {
    return new Response("Forbidden", { status: 403 });
  }

  const result = await readDocument(key);
  if (!result) {
    return new Response("Not found", { status: 404 });
  }
  const headers = new Headers(Object.fromEntries(result.headers.entries()));
  // ?inline=1 lets PDFs render in an <iframe> preview instead of downloading.
  if (req.nextUrl.searchParams.get("inline") === "1") {
    const name = path.at(-1) ?? "file";
    headers.set(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
  }
  return new Response(result.stream, { headers });
}
