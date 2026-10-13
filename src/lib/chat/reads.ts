// Chat page: unread counts. BasecampChatRead records when each person last
// saw each chat; a chat's unread count is its lines since then that someone
// else wrote.

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/**
 * Unread messages per chat for one person. On their first visit everything
 * up to now counts as read, so the launch doesn't greet people with
 * thousands of old "unread" messages.
 */
export async function unreadCounts(userId: string, myPersonId: string | null): Promise<Map<string, number>> {
  const hasReads = await db.basecampChatRead.findFirst({ where: { userId }, select: { userId: true } });
  if (!hasReads) {
    const chats = await db.basecampChat.findMany({ select: { basecampId: true } });
    const now = new Date();
    await db.basecampChatRead.createMany({
      data: chats.map((chat) => ({ userId, chatBasecampId: chat.basecampId, lastReadAt: now })),
      skipDuplicates: true,
    });
    return new Map();
  }
  // Chats added to Basecamp after someone's first visit have no read row
  // yet: count from the first visit (their oldest read), not from the start.
  const rows = await db.$queryRaw<{ chatBasecampId: string; unread: number }[]>`
    WITH baseline AS (
      SELECT MIN("lastReadAt") AS first_seen FROM "BasecampChatRead" WHERE "userId" = ${userId}
    )
    SELECT line."chatBasecampId", COUNT(*)::int AS unread
    FROM "BasecampChatLine" AS line
    LEFT JOIN "BasecampChatRead" AS read
      ON read."chatBasecampId" = line."chatBasecampId" AND read."userId" = ${userId}
    CROSS JOIN baseline
    WHERE line."createdAt" > COALESCE(read."lastReadAt", baseline.first_seen)
      ${myPersonId ? Prisma.sql`AND line."creatorPersonId" IS DISTINCT FROM ${myPersonId}` : Prisma.empty}
    GROUP BY line."chatBasecampId"`;
  return new Map(rows.map((row) => [row.chatBasecampId, row.unread]));
}

/** The person has now seen everything in this chat. */
export async function markChatRead(userId: string, chatBasecampId: string, at = new Date()) {
  await db.basecampChatRead.upsert({
    where: { userId_chatBasecampId: { userId, chatBasecampId } },
    create: { userId, chatBasecampId, lastReadAt: at },
    update: { lastReadAt: at },
  });
}
