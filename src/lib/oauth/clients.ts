import { z } from "zod";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/oauth/crypto";

// OAuth clients (AI apps). Two ways in:
// - Dynamic Client Registration (RFC 7591): the app POSTs its metadata to
//   /oauth/register and gets a random client_id.
// - Client ID Metadata Documents (CIMD, MCP 2026-07-28): the client_id IS
//   an https URL serving the app's metadata; fetched and cached here.

const BLOCKED_SCHEMES = ["javascript:", "data:", "file:", "vbscript:", "about:", "blob:"];

/**
 * Allowed redirect URIs: https, http on loopback (desktop apps), or a
 * private-use app scheme (cursor://…). No fragments.
 */
export function isAllowedRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:")
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (BLOCKED_SCHEMES.includes(url.protocol)) return false;
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol);
}

const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(100).optional(),
  redirect_uris: z.array(z.string()).min(1).max(10),
  client_uri: z.string().url().optional(),
  logo_uri: z.string().url().optional(),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_post", "client_secret_basic"])
    .optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
});

export type RegistrationResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string; description: string };

/** RFC 7591 registration. Confidential clients get a secret (shown once). */
export async function registerClient(input: unknown): Promise<RegistrationResult> {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "invalid_client_metadata", description: parsed.error.issues[0]?.message ?? "Invalid metadata" };
  const data = parsed.data;
  const bad = data.redirect_uris.find((uri) => !isAllowedRedirectUri(uri));
  if (bad) return { ok: false, error: "invalid_redirect_uri", description: `Redirect URI not allowed: ${bad}` };

  const method = data.token_endpoint_auth_method ?? "none";
  const clientId = `hcm_${randomToken(16)}`;
  const secret = method === "none" ? null : randomToken(32);
  const name = data.client_name ?? new URL(data.redirect_uris[0]).hostname;
  await db.oAuthClient.create({
    data: {
      id: clientId,
      name,
      redirectUris: data.redirect_uris,
      clientUri: data.client_uri ?? null,
      logoUri: data.logo_uri ?? null,
      kind: "dcr",
      clientSecretHash: secret ? sha256(secret) : null,
    },
  });
  return {
    ok: true,
    body: {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_name: name,
      redirect_uris: data.redirect_uris,
      token_endpoint_auth_method: method,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "hcm",
    },
  };
}

const cimdSchema = z.object({
  client_id: z.string(),
  client_name: z.string().trim().min(1).max(100).optional(),
  redirect_uris: z.array(z.string()).min(1).max(10),
  client_uri: z.string().url().optional(),
  logo_uri: z.string().url().optional(),
});

const CIMD_TTL_MS = 24 * 60 * 60 * 1000;

/** Fetches and validates a client metadata document (CIMD). */
async function fetchClientMetadata(clientId: string) {
  const url = new URL(clientId);
  if (url.protocol !== "https:" || url.hash) return null;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const text = await response.text();
  if (text.length > 20_000) return null;
  const parsed = cimdSchema.safeParse(JSON.parse(text));
  if (!parsed.success || parsed.data.client_id !== clientId) return null;
  if (!parsed.data.redirect_uris.every(isAllowedRedirectUri)) return null;
  return parsed.data;
}

export type Client = { id: string; name: string; redirectUris: string[]; clientUri: string | null; kind: string; clientSecretHash: string | null };

/** A known client by id; CIMD URLs are fetched (and re-fetched daily). */
export async function resolveClient(clientId: string): Promise<Client | null> {
  if (!clientId) return null;
  const existing = await db.oAuthClient.findUnique({ where: { id: clientId } });
  const isUrl = clientId.startsWith("https://");
  if (existing && (!isUrl || Date.now() - existing.updatedAt.getTime() < CIMD_TTL_MS)) return existing;
  if (!isUrl) return null;
  let metadata;
  try {
    metadata = await fetchClientMetadata(clientId);
  } catch {
    metadata = null;
  }
  if (!metadata) return existing ?? null;
  const name = metadata.client_name ?? new URL(clientId).hostname;
  return db.oAuthClient.upsert({
    where: { id: clientId },
    create: {
      id: clientId,
      name,
      redirectUris: metadata.redirect_uris,
      clientUri: metadata.client_uri ?? null,
      logoUri: metadata.logo_uri ?? null,
      kind: "cimd",
    },
    update: { name, redirectUris: metadata.redirect_uris, clientUri: metadata.client_uri ?? null, logoUri: metadata.logo_uri ?? null },
  });
}

/**
 * Exact match against the registered redirect URIs; for loopback http the
 * port may differ (RFC 8252 §7.3, desktop apps pick a free port).
 */
export function redirectUriMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let asked: URL;
  try {
    asked = new URL(requested);
  } catch {
    return false;
  }
  if (asked.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(asked.hostname)) return false;
  return registered.some((uri) => {
    try {
      const known = new URL(uri);
      return (
        known.protocol === "http:" &&
        known.hostname === asked.hostname &&
        known.pathname === asked.pathname &&
        known.search === asked.search
      );
    } catch {
      return false;
    }
  });
}
