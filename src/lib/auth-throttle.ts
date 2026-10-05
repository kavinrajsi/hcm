import { db } from "@/lib/db";

// Sliding-window throttle for sign-in failures and password-reset requests,
// stored in the DB so every function instance sees the same counts. Keys look
// like "login:email:a@b.com" or "reset:ip:1.2.3.4".
//
// The limiter never takes sign-in down: if the table is unreachable it logs
// and lets the request through.

export type Limit = { key: string; max: number; windowMs: number };

const MINUTE = 60_000;

/** Failed sign-ins: tight per account, loose per IP (offices share one NAT IP). */
export function loginLimits(email: string, ip: string | null): Limit[] {
  const limits: Limit[] = [
    { key: `login:email:${email}`, max: 5, windowMs: 15 * MINUTE },
  ];
  if (ip) limits.push({ key: `login:ip:${ip}`, max: 50, windowMs: 15 * MINUTE });
  return limits;
}

/** Failed passkey sign-ins: no email is typed, so only per IP. */
export function passkeyLimits(ip: string | null): Limit[] {
  return ip ? [{ key: `passkey:ip:${ip}`, max: 50, windowMs: 15 * MINUTE }] : [];
}

/** Passkey sign-in challenges handed out (each is a DB row), per IP. */
export function passkeyOptionLimits(ip: string | null): Limit[] {
  return ip ? [{ key: `passkey-options:ip:${ip}`, max: 60, windowMs: 15 * MINUTE }] : [];
}

/** Reset-link requests: a few per account, more per IP. */
export function resetLimits(email: string, ip: string | null): Limit[] {
  const limits: Limit[] = [
    { key: `reset:email:${email}`, max: 3, windowMs: 60 * MINUTE },
  ];
  if (ip) limits.push({ key: `reset:ip:${ip}`, max: 20, windowMs: 60 * MINUTE });
  return limits;
}

/** True when any limit has already been reached within its window. */
export async function isThrottled(limits: Limit[]): Promise<boolean> {
  try {
    const counts = await Promise.all(
      limits.map((limit) =>
        db.authAttempt.count({
          where: {
            key: limit.key,
            createdAt: { gt: new Date(Date.now() - limit.windowMs) },
          },
        }),
      ),
    );
    return counts.some((count, i) => count >= limits[i].max);
  } catch (error) {
    console.error("[auth-throttle] check failed", error);
    return false;
  }
}

/** Counts one attempt against every limit. */
export async function recordAttempt(limits: Limit[]): Promise<void> {
  try {
    await db.authAttempt.createMany({
      data: limits.map((limit) => ({ key: limit.key })),
    });
  } catch (error) {
    console.error("[auth-throttle] record failed", error);
  }
}

/** Forgets an account's failures after it signs in. */
export async function clearAttempts(key: string): Promise<void> {
  try {
    await db.authAttempt.deleteMany({ where: { key } });
  } catch (error) {
    console.error("[auth-throttle] clear failed", error);
  }
}

/** Client IP from the proxy headers Vercel sets; null when unknown. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || null;
}

/** Attempts older than this are pruned by the daily cleanup cron. */
export const AUTH_ATTEMPT_RETENTION_MS = 24 * 60 * MINUTE;
