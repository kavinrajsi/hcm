import { db } from "@/lib/db";
import { randomToken, safeEqual, sha256, verifyPkce } from "@/lib/oauth/crypto";
import type { Client } from "@/lib/oauth/clients";

// Codes and tokens for HCM's OAuth server. Access tokens last an hour,
// refresh tokens 30 days and rotate on every use (a reused one is refused).

export const SCOPE = "hcm";
const CODE_TTL_MS = 10 * 60 * 1000;
export const ACCESS_TTL_S = 60 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function issueCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
}): Promise<string> {
  const code = randomToken(32);
  await db.oAuthCode.create({
    data: {
      codeHash: sha256(code),
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      scope: SCOPE,
      resource: input.resource,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return code;
}

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export type GrantError = { error: string; error_description: string };

async function mintTokens(clientId: string, userId: string, resource: string | null): Promise<TokenResponse> {
  const access = randomToken(32);
  const refresh = randomToken(32);
  await db.oAuthToken.create({
    data: {
      accessHash: sha256(access),
      refreshHash: sha256(refresh),
      clientId,
      userId,
      scope: SCOPE,
      resource,
      accessExpiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: SCOPE };
}

/** Confidential clients must prove their secret; public ones can't. */
export function clientAuthenticated(client: Client, secret: string | null): boolean {
  if (!client.clientSecretHash) return true;
  return Boolean(secret) && safeEqual(sha256(secret!), client.clientSecretHash);
}

export async function exchangeCode(input: {
  client: Client;
  code: string;
  redirectUri: string;
  codeVerifier: string | null;
}): Promise<TokenResponse | GrantError> {
  const invalid = (description: string): GrantError => ({ error: "invalid_grant", error_description: description });
  const row = await db.oAuthCode.findUnique({ where: { codeHash: sha256(input.code) } });
  if (!row || row.clientId !== input.client.id) return invalid("Unknown code");
  // Single use: claim it before anything else.
  const claimed = await db.oAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) {
    // Reuse of a code: revoke what it produced (RFC 6749 §4.1.2).
    await db.oAuthToken.updateMany({
      where: { clientId: row.clientId, userId: row.userId, createdAt: { gte: row.createdAt }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return invalid("Code already used");
  }
  if (row.expiresAt < new Date()) return invalid("Code expired");
  if (row.redirectUri !== input.redirectUri) return invalid("redirect_uri does not match");
  if (!verifyPkce(input.codeVerifier, row.codeChallenge)) return invalid("PKCE verification failed");
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { disabledAt: true } });
  if (!user || user.disabledAt) return invalid("Account disabled");
  return mintTokens(row.clientId, row.userId, row.resource);
}

export async function refreshTokens(input: { client: Client; refreshToken: string }): Promise<TokenResponse | GrantError> {
  const invalid = (description: string): GrantError => ({ error: "invalid_grant", error_description: description });
  const row = await db.oAuthToken.findUnique({ where: { refreshHash: sha256(input.refreshToken) } });
  if (!row || row.clientId !== input.client.id) return invalid("Unknown refresh token");
  if (row.revokedAt) {
    // A rotated-out refresh token came back: treat the connection as stolen.
    await db.oAuthToken.updateMany({
      where: { clientId: row.clientId, userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return invalid("Refresh token was revoked");
  }
  if (row.refreshExpiresAt < new Date()) return invalid("Refresh token expired");
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { disabledAt: true } });
  if (!user || user.disabledAt) return invalid("Account disabled");
  const rotated = await db.oAuthToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (rotated.count === 0) return invalid("Refresh token was revoked");
  return mintTokens(row.clientId, row.userId, row.resource);
}

export type AccessGrant = { tokenId: string; userId: string; clientId: string; clientName: string; expiresAt: Date };

/** The live grant behind an access token, or null. Disabled users get null. */
export async function verifyAccessToken(token: string | undefined): Promise<AccessGrant | null> {
  if (!token) return null;
  const row = await db.oAuthToken.findUnique({
    where: { accessHash: sha256(token) },
    select: {
      id: true,
      userId: true,
      clientId: true,
      accessExpiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      client: { select: { name: true } },
      user: { select: { disabledAt: true } },
    },
  });
  if (!row || row.revokedAt || row.accessExpiresAt < new Date() || row.user.disabledAt) return null;
  // Touch at most once a minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000)
    await db.oAuthToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { tokenId: row.id, userId: row.userId, clientId: row.clientId, clientName: row.client.name, expiresAt: row.accessExpiresAt };
}

/** Revoke one token (access or refresh); unknown tokens are ignored (RFC 7009). */
export async function revokeToken(token: string): Promise<void> {
  const hash = sha256(token);
  await db.oAuthToken.updateMany({
    where: { OR: [{ accessHash: hash }, { refreshHash: hash }], revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
