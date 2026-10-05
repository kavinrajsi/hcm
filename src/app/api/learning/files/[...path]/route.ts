import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/rbac";
import { canReadFile, chunkRange, signedReadUrl } from "@/lib/learning/files";

// A course file for someone who can open that course, served from HCM's
// own domain. Browsers can't load the private Blob URLs directly (the
// store answers them with errors and a CSP that blanks PDF viewers), so
// the bytes come through here, a capped range at a time because a
// Function response can't exceed 4.5 MB (see chunkRange). Videos ask for
// ranges by themselves; PDFs and downloads are fetched in ranges by the
// page (learning/_components/fetch-file.ts).

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

  const asked = request.headers.get("range");
  const range = chunkRange(asked);
  if (!range) return new Response("Bad range", { status: 416 });

  const upstream = await fetch(await signedReadUrl(key), {
    headers: { Range: `bytes=${range.start}-${range.end}` },
  });
  if (upstream.status === 416) return new Response("Range not satisfiable", { status: 416 });
  if (!upstream.ok || !upstream.body) {
    console.error("[learning/files] storage answered", upstream.status, key);
    return new Response("File unavailable", { status: 502 });
  }

  // "bytes 0-4194303/123456789" → total size.
  const contentRange = upstream.headers.get("content-range");
  const total = Number(contentRange?.split("/")[1] ?? upstream.headers.get("content-length"));
  const whole = upstream.status === 200 || (range.start === 0 && range.end >= total - 1);

  const name = key.split("/").pop() ?? "file";
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=300",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  // A plain request for a small file gets it whole; anything else is a range.
  if (!asked && whole) return new Response(upstream.body, { status: 200, headers });
  if (contentRange) headers.set("Content-Range", contentRange);
  return new Response(upstream.body, { status: 206, headers });
}
