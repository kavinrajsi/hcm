import { randomBytes, timingSafeEqual } from "node:crypto";

// One-time `state` for the Basecamp OAuth round trip (CSRF protection):
// the connect route sets it in a short-lived httpOnly cookie and sends it
// to Basecamp; the callback requires the two to match.

export const STATE_COOKIE = "hcm_basecamp_state";
export const STATE_MAX_AGE_S = 10 * 60;

export function newState(): string {
  return randomBytes(32).toString("base64url");
}

export function stateMatches(fromCookie: string | undefined, fromQuery: string | null): boolean {
  if (!fromCookie || !fromQuery) return false;
  const left = Buffer.from(fromCookie);
  const right = Buffer.from(fromQuery);
  return left.length === right.length && timingSafeEqual(left, right);
}
