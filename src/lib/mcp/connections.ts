import { db } from "@/lib/db";

// Connected AI apps: one row per app per user, from their live OAuth tokens.

export type Connection = {
  clientId: string;
  clientName: string;
  userId: string;
  userName: string;
  connectedAt: Date;
  lastUsedAt: Date | null;
};

/** Live (unrevoked, unexpired refresh) connections, newest first. */
export async function listConnections(userId?: string): Promise<Connection[]> {
  const tokens = await db.oAuthToken.findMany({
    where: { revokedAt: null, refreshExpiresAt: { gt: new Date() }, ...(userId ? { userId } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      clientId: true,
      userId: true,
      createdAt: true,
      lastUsedAt: true,
      client: { select: { name: true } },
      user: { select: { name: true, email: true } },
    },
  });
  const byKey = new Map<string, Connection>();
  for (const token of tokens) {
    const key = `${token.userId}|${token.clientId}`;
    const existing = byKey.get(key);
    if (existing) {
      if (token.lastUsedAt && (!existing.lastUsedAt || token.lastUsedAt > existing.lastUsedAt))
        existing.lastUsedAt = token.lastUsedAt;
      if (token.createdAt < existing.connectedAt) existing.connectedAt = token.createdAt;
      continue;
    }
    byKey.set(key, {
      clientId: token.clientId,
      clientName: token.client.name,
      userId: token.userId,
      userName: token.user.name || token.user.email,
      connectedAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
    });
  }
  return [...byKey.values()];
}

/** Revoke every token a user granted to one app. */
export async function disconnect(userId: string, clientId: string): Promise<number> {
  const { count } = await db.oAuthToken.updateMany({
    where: { userId, clientId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count;
}
