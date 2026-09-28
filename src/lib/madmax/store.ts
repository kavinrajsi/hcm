import type { UIMessage } from "ai";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// MadMax chat persistence: threads per user, messages as UIMessage parts.

export async function listThreads(userId: string) {
  return db.chatThread.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });
}

/** The thread if the user owns it, else null. */
export async function findOwnThread(threadId: string, userId: string) {
  const thread = await db.chatThread.findUnique({ where: { id: threadId } });
  return thread && thread.userId === userId ? thread : null;
}

export async function loadMessages(threadId: string): Promise<UIMessage[]> {
  const rows = await db.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: row.parts as unknown as UIMessage["parts"],
  }));
}

/** First words of the first user message, for the history list. */
export function titleFrom(message: UIMessage): string {
  const text = message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "New chat";
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/** Upserts every message (the last turn may have grown) and bumps the thread. */
export async function saveMessages(threadId: string, messages: UIMessage[]) {
  const base = Date.now() - messages.length;
  await db.$transaction([
    ...messages.map((message, index) =>
      db.chatMessage.upsert({
        where: { id: message.id },
        create: {
          id: message.id,
          threadId,
          role: message.role,
          parts: message.parts as unknown as Prisma.InputJsonValue,
          // Keep conversation order even when rows share a timestamp.
          createdAt: new Date(base + index),
        },
        update: { parts: message.parts as unknown as Prisma.InputJsonValue },
      }),
    ),
    db.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    }),
  ]);
}
