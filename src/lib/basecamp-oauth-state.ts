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

/** Where the callback sends people back to (only these pages start a connect). */
export const RETURN_COOKIE = "hcm_basecamp_return";
const RETURN_PATHS = ["/leave", "/chat"];

export function safeReturnPath(value: string | null | undefined): string {
  if (!value) return "/leave";
  // Only our own pages: "/chat" or "/chat/123", never "//evil.example" or a full URL.
  const match = RETURN_PATHS.find((path) => value === path || value.startsWith(`${path}/`));
  return match && /^\/[\w/-]*$/.test(value) ? value : "/leave";
}
