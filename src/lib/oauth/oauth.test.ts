import { beforeEach, describe, expect, it, vi } from "vitest";
import { s256, sha256, verifyPkce } from "./crypto";
import { isAllowedRedirectUri, redirectUriMatches } from "./clients";

const db = vi.hoisted(() => ({
  oAuthCode: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  oAuthToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

const { exchangeCode, refreshTokens, verifyAccessToken, clientAuthenticated } = await import("./grants");

const verifier = "a".repeat(43);
const client = { id: "c1", name: "Claude", redirectUris: ["https://claude.ai/cb"], clientUri: null, kind: "dcr", clientSecretHash: null };
const codeRow = (overrides: Record<string, unknown> = {}) => ({
  id: "code1",
  clientId: "c1",
  userId: "u1",
  redirectUri: "https://claude.ai/cb",
  codeChallenge: s256(verifier),
  resource: null,
  expiresAt: new Date(Date.now() + 60_000),
  createdAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.oAuthCode.updateMany.mockResolvedValue({ count: 1 });
  db.oAuthToken.updateMany.mockResolvedValue({ count: 1 });
  db.user.findUnique.mockResolvedValue({ disabledAt: null });
});

describe("PKCE", () => {
  it("accepts the matching verifier only", () => {
    expect(verifyPkce(verifier, s256(verifier))).toBe(true);
    expect(verifyPkce("b".repeat(43), s256(verifier))).toBe(false);
    expect(verifyPkce("short", s256("short"))).toBe(false);
    expect(verifyPkce(null, s256(verifier))).toBe(false);
  });
});

describe("redirect URIs", () => {
  it("allows https, loopback http and app schemes", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:6274/oauth/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:33418/cb")).toBe(true);
    expect(isAllowedRedirectUri("cursor://anysphere.cursor-retrieval/oauth/callback")).toBe(true);
  });
  it("refuses plain http elsewhere, script schemes and fragments", () => {
    expect(isAllowedRedirectUri("http://evil.example/cb")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai/cb#x")).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
  });
  it("matches exactly, except a loopback port", () => {
    expect(redirectUriMatches(["https://claude.ai/cb"], "https://claude.ai/cb")).toBe(true);
    expect(redirectUriMatches(["https://claude.ai/cb"], "https://claude.ai/cb2")).toBe(false);
    expect(redirectUriMatches(["http://127.0.0.1:1000/cb"], "http://127.0.0.1:5555/cb")).toBe(true);
    expect(redirectUriMatches(["http://127.0.0.1:1000/cb"], "http://127.0.0.1:5555/other")).toBe(false);
  });
});

describe("code exchange", () => {
  it("mints tokens for a valid code, verifier and redirect URI", async () => {
    db.oAuthCode.findUnique.mockResolvedValue(codeRow());
    const result = await exchangeCode({ client, code: "code", redirectUri: "https://claude.ai/cb", codeVerifier: verifier });
    expect(result).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "hcm" });
    expect(db.oAuthCode.findUnique).toHaveBeenCalledWith({ where: { codeHash: sha256("code") } });
    const stored = db.oAuthToken.create.mock.calls[0][0].data;
    expect(stored.accessHash).toBe(sha256((result as { access_token: string }).access_token));
  });

  it("refuses a wrong verifier, wrong redirect, expiry and another client", async () => {
    db.oAuthCode.findUnique.mockResolvedValue(codeRow());
    expect(await exchangeCode({ client, code: "c", redirectUri: "https://claude.ai/cb", codeVerifier: "b".repeat(43) })).toMatchObject({ error: "invalid_grant" });
    expect(await exchangeCode({ client, code: "c", redirectUri: "https://evil.example/cb", codeVerifier: verifier })).toMatchObject({ error: "invalid_grant" });
    db.oAuthCode.findUnique.mockResolvedValue(codeRow({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await exchangeCode({ client, code: "c", redirectUri: "https://claude.ai/cb", codeVerifier: verifier })).toMatchObject({ error_description: "Code expired" });
    db.oAuthCode.findUnique.mockResolvedValue(codeRow({ clientId: "other" }));
    expect(await exchangeCode({ client, code: "c", redirectUri: "https://claude.ai/cb", codeVerifier: verifier })).toMatchObject({ error: "invalid_grant" });
    expect(db.oAuthToken.create).not.toHaveBeenCalled();
  });

  it("refuses a reused code and revokes what it issued", async () => {
    db.oAuthCode.findUnique.mockResolvedValue(codeRow());
    db.oAuthCode.updateMany.mockResolvedValue({ count: 0 });
    const result = await exchangeCode({ client, code: "c", redirectUri: "https://claude.ai/cb", codeVerifier: verifier });
    expect(result).toMatchObject({ error_description: "Code already used" });
    expect(db.oAuthToken.updateMany).toHaveBeenCalled();
  });

  it("refuses a disabled account", async () => {
    db.oAuthCode.findUnique.mockResolvedValue(codeRow());
    db.user.findUnique.mockResolvedValue({ disabledAt: new Date() });
    expect(await exchangeCode({ client, code: "c", redirectUri: "https://claude.ai/cb", codeVerifier: verifier })).toMatchObject({ error_description: "Account disabled" });
  });
});

describe("refresh", () => {
  const tokenRow = (overrides: Record<string, unknown> = {}) => ({
    id: "t1",
    clientId: "c1",
    userId: "u1",
    resource: null,
    revokedAt: null,
    refreshExpiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  });

  it("rotates: the old token is revoked and a new pair issued", async () => {
    db.oAuthToken.findUnique.mockResolvedValue(tokenRow());
    const result = await refreshTokens({ client, refreshToken: "r" });
    expect(result).toMatchObject({ token_type: "Bearer" });
    expect(db.oAuthToken.updateMany).toHaveBeenCalledWith({ where: { id: "t1", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it("treats a rotated-out token as stolen and revokes the connection", async () => {
    db.oAuthToken.findUnique.mockResolvedValue(tokenRow({ revokedAt: new Date() }));
    const result = await refreshTokens({ client, refreshToken: "r" });
    expect(result).toMatchObject({ error: "invalid_grant" });
    expect(db.oAuthToken.updateMany).toHaveBeenCalledWith({
      where: { clientId: "c1", userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(db.oAuthToken.create).not.toHaveBeenCalled();
  });
});

describe("access tokens", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "t1",
    userId: "u1",
    clientId: "c1",
    accessExpiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    lastUsedAt: new Date(),
    client: { name: "Claude" },
    user: { disabledAt: null },
    ...overrides,
  });

  it("returns the grant for a live token", async () => {
    db.oAuthToken.findUnique.mockResolvedValue(row());
    expect(await verifyAccessToken("tok")).toMatchObject({ userId: "u1", clientName: "Claude" });
  });

  it("refuses missing, revoked, expired tokens and disabled users", async () => {
    expect(await verifyAccessToken(undefined)).toBeNull();
    db.oAuthToken.findUnique.mockResolvedValue(row({ revokedAt: new Date() }));
    expect(await verifyAccessToken("t")).toBeNull();
    db.oAuthToken.findUnique.mockResolvedValue(row({ accessExpiresAt: new Date(Date.now() - 1) }));
    expect(await verifyAccessToken("t")).toBeNull();
    db.oAuthToken.findUnique.mockResolvedValue(row({ user: { disabledAt: new Date() } }));
    expect(await verifyAccessToken("t")).toBeNull();
  });
});

describe("client secrets", () => {
  it("public clients need none; confidential ones must match", () => {
    expect(clientAuthenticated(client, null)).toBe(true);
    const confidential = { ...client, clientSecretHash: sha256("s3cret") };
    expect(clientAuthenticated(confidential, "s3cret")).toBe(true);
    expect(clientAuthenticated(confidential, "wrong")).toBe(false);
    expect(clientAuthenticated(confidential, null)).toBe(false);
  });
});
