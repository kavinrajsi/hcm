import { readDocument } from "@/lib/blob";
import { getShotMap, isGuideShot } from "@/lib/mcp-guide-store";

// Public: guide screenshots for /mcp/instructions (no personal data).
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!isGuideShot(file)) return new Response("Not found", { status: 404 });
  const entry = (await getShotMap())[file];
  if (!entry) return new Response("Not found", { status: 404 });
  const result = await readDocument(entry.pathname);
  if (!result) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  headers.set("Content-Type", result.headers.get("content-type") ?? "image/png");
  // URLs carry ?v=<upload time>, so a replaced image gets a new URL.
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(result.stream, { headers });
}
