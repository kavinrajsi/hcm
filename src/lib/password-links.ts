import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";

// One-time "set your password" links, used for both password resets and
// new-account invites. Only the sha256 of the token is stored; a new link
// replaces any unused ones for that user.

export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function appOrigin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? process.env.AUTH_URL ?? "http://localhost:3000";
}

/** Creates a single-use link to /reset-password for this user. */
export async function createPasswordLink(
  userId: string,
  { ttlMs, invite = false }: { ttlMs: number; invite?: boolean },
): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
    db.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt: new Date(Date.now() + ttlMs) },
    }),
  ]);

  const params = new URLSearchParams({ token: rawToken });
  if (invite) params.set("invite", "1");
  return `${await appOrigin()}/reset-password?${params}`;
}
