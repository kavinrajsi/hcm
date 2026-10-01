import { getPublicOrigin } from "mcp-handler";

// Shared bits for the OAuth HTTP endpoints: the issuer (this deployment's
// public origin), CORS for browser-based MCP clients, JSON responses.

export function issuer(request: Request): string {
  return (process.env.AUTH_URL?.replace(/\/$/, "") || getPublicOrigin(request)).replace(/\/$/, "");
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...extra },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Reads a form-encoded or JSON body into a plain string map. */
export async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).filter(([, value]) => typeof value === "string")) as Record<string, string>;
  }
  const form = new URLSearchParams(await request.text());
  return Object.fromEntries(form.entries());
}

/** client_id/secret from HTTP Basic auth, if sent. */
export function basicCredentials(request: Request): { id: string; secret: string } | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return null;
  const [id, secret] = Buffer.from(header.slice(6), "base64").toString().split(":");
  return id ? { id: decodeURIComponent(id), secret: decodeURIComponent(secret ?? "") } : null;
}
