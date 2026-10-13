// Chat page: stored lines as the messages the page and the poll route send
// to the browser, with the sender's HCM name and photo when their Basecamp
// person id is linked to an employee.

import { db } from "@/lib/db";
import type { ChatAttachment } from "./lines";

export const PAGE_SIZE = 50;

export type ChatMessage = {
  id: string;
  personId: string | null;
  name: string;
  avatarKey: string | null;
  html: string;
  attachments: ChatAttachment[];
  createdAt: string; // ISO
};

type LineRow = {
  basecampId: string;
  creatorPersonId: string | null;
  creatorName: string;
  contentHtml: string;
  attachments: unknown;
  createdAt: Date;
};

export async function toMessages(lines: LineRow[]): Promise<ChatMessage[]> {
  const personIds = [...new Set(lines.flatMap((line) => (line.creatorPersonId ? [line.creatorPersonId] : [])))];
  const employees = personIds.length
    ? await db.employee.findMany({
        where: { basecampPersonId: { in: personIds } },
        select: { basecampPersonId: true, name: true, avatarBlobKey: true },
      })
    : [];
  const byPerson = new Map(employees.map((employee) => [employee.basecampPersonId, employee]));
  return lines.map((line) => {
    const employee = line.creatorPersonId ? byPerson.get(line.creatorPersonId) : undefined;
    return {
      id: line.basecampId,
      personId: line.creatorPersonId,
      name: employee?.name ?? line.creatorName,
      avatarKey: employee?.avatarBlobKey ?? null,
      html: line.contentHtml,
      attachments: (line.attachments as ChatAttachment[] | null) ?? [],
      createdAt: line.createdAt.toISOString(),
    };
  });
}

const LINE_SELECT = {
  basecampId: true,
  creatorPersonId: true,
  creatorName: true,
  contentHtml: true,
  attachments: true,
  createdAt: true,
} as const;

/** The newest PAGE_SIZE messages, oldest first (as a chat reads). */
export async function latestMessages(chatBasecampId: string) {
  const lines = await db.basecampChatLine.findMany({
    where: { chatBasecampId },
    orderBy: [{ createdAt: "desc" }, { basecampId: "desc" }],
    take: PAGE_SIZE + 1,
    select: LINE_SELECT,
  });
  return { messages: await toMessages(lines.slice(0, PAGE_SIZE).reverse()), hasEarlier: lines.length > PAGE_SIZE };
}

/** Messages after `afterIso` (the poll), oldest first. */
export async function messagesAfter(chatBasecampId: string, afterIso: string) {
  const after = new Date(afterIso);
  if (Number.isNaN(after.getTime())) return [];
  const lines = await db.basecampChatLine.findMany({
    where: { chatBasecampId, createdAt: { gt: after } },
    orderBy: [{ createdAt: "asc" }, { basecampId: "asc" }],
    take: 200,
    select: LINE_SELECT,
  });
  return toMessages(lines);
}

/** PAGE_SIZE messages before `beforeIso` ("Load earlier"), oldest first. */
export async function messagesBefore(chatBasecampId: string, beforeIso: string) {
  const before = new Date(beforeIso);
  if (Number.isNaN(before.getTime())) return { messages: [], hasEarlier: false };
  const lines = await db.basecampChatLine.findMany({
    where: { chatBasecampId, createdAt: { lt: before } },
    orderBy: [{ createdAt: "desc" }, { basecampId: "desc" }],
    take: PAGE_SIZE + 1,
    select: LINE_SELECT,
  });
  return { messages: await toMessages(lines.slice(0, PAGE_SIZE).reverse()), hasEarlier: lines.length > PAGE_SIZE };
}
