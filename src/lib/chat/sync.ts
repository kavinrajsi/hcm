// Chat page sync: copies Basecamp project chats (Campfires) and their lines
// into BasecampChat / BasecampChatLine. Basecamp sends no webhooks for chat
// and a chat's updated_at doesn't move when someone posts, so new lines are
// found by reading each chat's newest page (lines come newest first) and
// stopping at the first line already stored. Reads use the HR admin's
// connection; sending uses the sender's own.

import { db } from "@/lib/db";
import { eachPage, getAccessToken } from "@/lib/basecamp";
import { eachLimited } from "@/lib/basecamp-people";
import { leaveSyncUserId } from "@/lib/leave-sync";
import {
  plainTextToHtml,
  toChatLineRow,
  toChatRow,
  type BasecampChatLineRecording,
  type BasecampChatRecording,
} from "./lines";

const USER_AGENT = "HCM Chat (internal)";
const API = "https://3.basecampapi.com/";
// Everyone looking at a chat shares one Basecamp check per this window.
export const OPEN_CHAT_REFRESH_MS = 5_000;

type Token = { accessToken: string; accountId: string };

async function hrConnection(): Promise<Token> {
  const userId = await leaveSyncUserId();
  const token = userId && (await getAccessToken(userId));
  if (!token) throw new Error("No HR admin has connected Basecamp");
  return token;
}

/** Every project chat the HR connection can see. */
export async function syncChatList(token: Token): Promise<string[]> {
  const ids: string[] = [];
  await eachPage<BasecampChatRecording>(
    token.accessToken,
    `${API}${token.accountId}/chats.json`,
    USER_AGENT,
    async (page) => {
      await Promise.all(
        page.map((chat) => {
          const row = toChatRow(chat);
          ids.push(row.basecampId);
          return db.basecampChat.upsert({ where: { basecampId: row.basecampId }, create: row, update: row });
        }),
      );
    },
  );
  return ids;
}

/**
 * New lines of one chat, newest first, until a line we already have (or the
 * start of the chat on the first load). Returns how many were added.
 */
export async function syncChatLines(
  token: Token,
  chat: { basecampId: string; linesUrl: string },
): Promise<number> {
  if (!chat.linesUrl.startsWith(API)) throw new Error("Unexpected chat URL");
  let added = 0;
  let newest: ReturnType<typeof toChatLineRow> | null = null;
  await eachPage<BasecampChatLineRecording>(token.accessToken, chat.linesUrl, USER_AGENT, async (page) => {
    const rows = page.map((line) => toChatLineRow(chat.basecampId, line));
    newest ??= rows[0] ?? null;
    const known = new Set(
      (
        await db.basecampChatLine.findMany({
          where: { basecampId: { in: rows.map((row) => row.basecampId) } },
          select: { basecampId: true },
        })
      ).map((row) => row.basecampId),
    );
    const fresh = rows.filter((row) => !known.has(row.basecampId));
    if (fresh.length) {
      const result = await db.basecampChatLine.createMany({
        data: fresh.map((row) => {
          const { preview, ...line } = row;
          void preview; // only for the chat list, not stored per line
          return line;
        }),
        skipDuplicates: true,
      });
      added += result.count;
    }
    // Newest first: once a page holds a line we have, the rest is older.
    return known.size > 0;
  });

  const latest = newest as ReturnType<typeof toChatLineRow> | null;
  await db.basecampChat.update({
    where: { basecampId: chat.basecampId },
    data: {
      lastCheckedAt: new Date(),
      ...(latest ? { lastLineAt: latest.createdAt, lastLinePreview: `${latest.creatorName}: ${latest.preview}` } : {}),
    },
  });
  return added;
}

export type ChatSyncResult = { chats: number; added: number; failed: number };

/** The chat list, then new lines in every chat (the cron, and the first load). */
export async function syncAllChats(): Promise<ChatSyncResult> {
  const token = await hrConnection();
  await syncChatList(token);
  const chats = await db.basecampChat.findMany({ select: { basecampId: true, linesUrl: true } });
  let added = 0;
  let failed = 0;
  // One chat's failure (removed from Basecamp, 404) doesn't stop the rest.
  await eachLimited(chats, 3, async (chat) => {
    try {
      // Await first: `added += await …` would read `added` before the
      // await and lose counts from chats syncing in parallel.
      const count = await syncChatLines(token, chat);
      added += count;
    } catch {
      failed++;
    }
  });
  return { chats: chats.length, added, failed };
}

/**
 * The open chat: checks Basecamp at most once per OPEN_CHAT_REFRESH_MS,
 * however many people are looking at it. The claim is one conditional
 * update, so two viewers polling at once can't both call Basecamp.
 */
export async function refreshChatIfStale(chatBasecampId: string, now = new Date()): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - OPEN_CHAT_REFRESH_MS);
  const { count } = await db.basecampChat.updateMany({
    where: {
      basecampId: chatBasecampId,
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: staleBefore } }],
    },
    data: { lastCheckedAt: now },
  });
  if (count === 0) return false;
  const chat = await db.basecampChat.findUnique({
    where: { basecampId: chatBasecampId },
    select: { basecampId: true, linesUrl: true },
  });
  if (!chat) return false;
  await syncChatLines(await hrConnection(), chat);
  return true;
}

export class BasecampNotConnectedError extends Error {
  constructor() {
    super("Connect your Basecamp account to reply.");
  }
}

/** Posts a message as the sender (their own Basecamp connection) and stores it. */
export async function sendChatLine(userId: string, chatBasecampId: string, text: string) {
  const token = await getAccessToken(userId);
  if (!token) throw new BasecampNotConnectedError();
  const chat = await db.basecampChat.findUnique({
    where: { basecampId: chatBasecampId },
    select: { basecampId: true, linesUrl: true },
  });
  if (!chat) throw new Error("Chat not found");
  if (!chat.linesUrl.startsWith(`${API}${token.accountId}/`))
    throw new Error("This chat is in a different Basecamp account");

  const response = await fetch(chat.linesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: plainTextToHtml(text), content_type: "text/html" }),
  });
  if (!response.ok) throw new Error(`Basecamp didn't accept the message (${response.status})`);
  const { preview, ...row } = toChatLineRow(chat.basecampId, (await response.json()) as BasecampChatLineRecording);
  await db.basecampChatLine.upsert({ where: { basecampId: row.basecampId }, create: row, update: row });
  await db.basecampChat.update({
    where: { basecampId: chat.basecampId },
    data: { lastLineAt: row.createdAt, lastLinePreview: `${row.creatorName}: ${preview}` },
  });
  return row;
}
