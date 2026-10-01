import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Small helpers for HCM's OAuth server: opaque random tokens stored only as
// SHA-256 hashes, and the PKCE S256 check.

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** BASE64URL(SHA256(verifier)), the S256 code challenge for a verifier. */
export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** RFC 7636: verifier is 43–128 chars of [A-Z a-z 0-9 - . _ ~]. */
export function verifyPkce(verifier: string | null | undefined, challenge: string): boolean {
  if (!verifier || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return safeEqual(s256(verifier), challenge);
}
