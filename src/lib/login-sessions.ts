import { headers } from "next/headers";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/auth-throttle";

// Signed-in devices. Each sign-in creates a LoginSession whose id rides in
// the session JWT; currentUser (src/lib/rbac.ts) refuses a token whose row is
// missing, revoked or idle too long, which is what makes "Sign out" on
// another device work despite stateless JWTs.

/** Matches next-auth's default JWT lifetime. */
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Signed-out and expired devices stay listed this long. */
export const SESSION_RETENTION_DAYS = 365;
/** lastSeenAt/IP/location are refreshed at most this often. */
const TOUCH_EVERY_MS = 5 * 60_000;

export type LoginMethod = "password" | "passkey";

/** Where a request comes from: IP, browser, and Vercel's geo headers. */
export function requestContext(requestHeaders: Headers) {
  const geo = (name: string) => {
    const value = requestHeaders.get(name);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  return {
    ip: clientIp(requestHeaders),
    userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null,
    city: geo("x-vercel-ip-city"),
    region: geo("x-vercel-ip-country-region"),
    country: geo("x-vercel-ip-country"),
  };
}

/** Records a new sign-in from the current request; returns its id. */
export async function startLoginSession(userId: string, method: LoginMethod) {
  const { userAgent, ...place } = requestContext(await headers());
  const session = await db.loginSession.create({
    data: { userId, method, userAgent, ...place },
    select: { id: true },
  });
  return session.id;
}

export function isActive(session: { revokedAt: Date | null; lastSeenAt: Date }) {
  return !session.revokedAt && session.lastSeenAt.getTime() > Date.now() - SESSION_MAX_AGE_MS;
}

/**
 * True when this session may still be used by this user. Refreshes when and
 * where it was last used, at most every few minutes.
 */
export async function checkAndTouch(sessionId: string, userId: string): Promise<boolean> {
  const session = await db.loginSession.findUnique({
    where: { id: sessionId },
    select: { userId: true, revokedAt: true, lastSeenAt: true },
  });
  if (!session || session.userId !== userId || !isActive(session)) return false;

  if (session.lastSeenAt.getTime() < Date.now() - TOUCH_EVERY_MS) {
    const { userAgent, ...place } = requestContext(await headers());
    await db.loginSession
      .update({
        where: { id: sessionId },
        data: { lastSeenAt: new Date(), ...place, ...(userAgent ? { userAgent } : {}) },
      })
      .catch((error) => console.error("[login-sessions] touch failed", error));
  }
  return true;
}

/** Signs out one of this user's devices. */
export async function revokeSession(id: string, userId: string) {
  await db.loginSession.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Signs out every device of this user except `keepId`. */
export async function revokeOtherSessions(userId: string, keepId: string) {
  await db.loginSession.updateMany({
    where: { userId, revokedAt: null, id: { not: keepId } },
    data: { revokedAt: new Date() },
  });
}

/** Signs out every device of this user (e.g. after a password reset). */
export async function revokeAllSessions(userId: string) {
  await db.loginSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** "Chrome on macOS", "Safari on iPhone"… from a user-agent string. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const os = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(userAgent)
            ? "macOS"
            : /CrOS/.test(userAgent)
              ? "ChromeOS"
              : /Linux/.test(userAgent)
                ? "Linux"
                : null;
  // Order matters: Edge and Opera also say "Chrome"; Chrome also says "Safari".
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /Firefox\/|FxiOS/.test(userAgent)
        ? "Firefox"
        : /Chrome\/|CriOS/.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

/** "Chennai, Tamil Nadu, IN", or null when unknown (e.g. local dev). */
export function describePlace(session: {
  city: string | null;
  region: string | null;
  country: string | null;
}): string | null {
  const parts = [session.city, session.region, session.country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
