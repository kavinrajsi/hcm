import { db } from "@/lib/db";
import { readPii } from "@/lib/employee-pii";
import {
  checkinKind,
  getAccessToken,
  getCheckinAnswer,
  leaveCheckinConfig,
  listCheckinAnswers,
  syncedCheckins,
  type BasecampAnswer,
  type CheckinKind,
} from "@/lib/basecamp";
import { buildEmailIndex, htmlToText } from "@/lib/leave";
import { classifyLeavePosts } from "@/lib/leave-classify";
import type { AiTrigger } from "@/lib/ai-usage";

// Pulls the Basecamp leave and WFH check-ins into LeaveEntry and
// AI-classifies new rows. A check-in's first run imports its full history;
// later runs re-read the last 14 days (catches edits and late posts). Classification is capped per run so a run
// fits the function time limit — the rest is picked up next run.

const RESYNC_DAYS = 14;
const CLASSIFY_PER_RUN = 1000;
const BATCH_SIZE = 40;
// Free-tier gateway: 5 requests/min → one request every 13s is safe.
const MIN_REQUEST_GAP_MS = 13_000;
const RATE_LIMIT_BACKOFF_MS = 60_000;
const REQUEST_ESTIMATE_MS = 20_000;
// Leaves headroom for the Basecamp fetch inside the 300s function limit.
const CLASSIFY_BUDGET_MS = 180_000;

export type LeaveSyncResult = {
  fetched: number;
  created: number;
  updated: number;
  classified: number;
  remaining: number;
};

export async function syncLeaveFromBasecamp(
  userId: string,
  trigger: AiTrigger,
): Promise<LeaveSyncResult> {
  const auth = await getAccessToken(userId);
  if (!auth) throw new Error("Basecamp not connected — connect it first");

  const { accountId, bucketId } = leaveCheckinConfig();
  const recent = new Date(Date.now() - RESYNC_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  let fetched = 0;
  let created = 0;
  let updated = 0;
  for (const { kind, questionId } of syncedCheckins()) {
    const hasRows =
      (await db.leaveEntry.count({ where: { checkin: kind } })) > 0;
    const answers = await listCheckinAnswers(
      auth.accessToken,
      accountId,
      bucketId,
      questionId,
      hasRows ? recent : undefined,
    );
    const result = await ingestAnswers(answers, kind);
    fetched += answers.length;
    created += result.created;
    updated += result.updated;
  }

  const classified = await classifyPending(
    CLASSIFY_PER_RUN,
    CLASSIFY_BUDGET_MS,
    trigger,
  );
  const remaining = await db.leaveEntry.count({ where: { type: null } });
  return { fetched, created, updated, classified, remaining };
}

/**
 * Saves Basecamp check-in answers as LeaveEntry rows: new posts are added,
 * edited posts updated (and re-classified unless HR corrected them), and
 * posters are matched to employees by work/personal email. Shared by the
 * full sync and the webhook.
 */
export async function ingestAnswers(
  answers: BasecampAnswer[],
  checkin: CheckinKind,
): Promise<{ created: number; updated: number }> {
  // Personal emails are encrypted at rest; decrypt in memory for matching.
  const employees = (
    await db.employee.findMany({
      select: {
        id: true,
        workEmail: true,
        personalEmail: true,
        personalEmailEnc: true,
      },
    })
  ).map((employee) => ({
    id: employee.id,
    workEmail: employee.workEmail,
    personalEmail: readPii(employee).personalEmail,
  }));
  const emailIndex = buildEmailIndex(employees);

  const existing = new Map(
    (
      await db.leaveEntry.findMany({
        where: {
          basecampId: { in: answers.map((answer) => String(answer.id)) },
        },
        select: {
          id: true,
          basecampId: true,
          message: true,
          classifiedBy: true,
        },
      })
    ).map((entry) => [entry.basecampId, entry]),
  );

  const toCreate = [];
  let updated = 0;
  for (const answer of answers) {
    const email = answer.creator.email_address?.toLowerCase() ?? "";
    const row = {
      employeeId: emailIndex.get(email) ?? null,
      checkin,
      creatorName: answer.creator.name,
      creatorEmail: email,
      postedOn: new Date(answer.group_on),
      postedAt: new Date(answer.created_at),
      message: htmlToText(answer.content),
      link: answer.app_url,
    };
    const previous = existing.get(String(answer.id));
    if (!previous) {
      toCreate.push({ basecampId: String(answer.id), ...row });
    } else if (previous.message !== row.message) {
      // Edited post: re-classify unless HR corrected it by hand.
      await db.leaveEntry.update({
        where: { id: previous.id },
        data:
          previous.classifiedBy === "manual"
            ? row
            : { ...row, type: null, classifiedBy: null },
      });
      updated++;
    }
  }
  const { count: created } = await db.leaveEntry.createMany({
    data: toCreate,
    skipDuplicates: true,
  });

  // Link rows imported before the employee record existed.
  const unmatched = await db.leaveEntry.findMany({
    where: { employeeId: null },
    select: { id: true, creatorEmail: true },
  });
  for (const entry of unmatched) {
    const employeeId = emailIndex.get(entry.creatorEmail);
    if (employeeId) {
      await db.leaveEntry.update({
        where: { id: entry.id },
        data: { employeeId },
      });
    }
  }

  return { created, updated };
}

/**
 * The Basecamp connection the background jobs use: the most recently
 * connected HR admin. Null when no HR admin has connected Basecamp.
 */
export async function leaveSyncUserId(): Promise<string | null> {
  const hrUsers = await db.user.findMany({
    where: { role: "HR_ADMIN", disabledAt: null },
    select: { id: true },
  });
  const token = await db.basecampToken.findFirst({
    where: { userId: { in: hrUsers.map((user) => user.id) } },
    orderBy: { updatedAt: "desc" },
    select: { userId: true },
  });
  return token?.userId ?? null;
}

/**
 * Webhook path: fetch one answer from the API (never trust the payload),
 * make sure it belongs to the leave or WFH check-in, and ingest it.
 */
export async function syncOneAnswer(
  userId: string,
  answerId: string,
): Promise<{ created: number; updated: number; skipped?: string }> {
  const auth = await getAccessToken(userId);
  if (!auth) throw new Error("Basecamp not connected");
  const { accountId, bucketId } = leaveCheckinConfig();
  const answer = await getCheckinAnswer(
    auth.accessToken,
    accountId,
    bucketId,
    answerId,
  );
  const kind = checkinKind(answer.parent?.id);
  if (!kind) {
    return { created: 0, updated: 0, skipped: "not a leave or WFH check-in" };
  }
  return ingestAnswers([answer], kind);
}

/** ISO timestamp in Asia/Kolkata so "today"/"tomorrow" resolve correctly. */
function toIST(date: Date): string {
  return new Date(date.getTime() + 330 * 60_000)
    .toISOString()
    .replace("Z", "+05:30");
}

function toDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Classifies unclassified rows, newest first, one request at a time — the
 * AI Gateway free tier allows 5 requests/min. Stops at `limit` rows or when
 * `budgetMs` runs out (keeps a sync inside the function time limit).
 */
export async function classifyPending(
  limit: number,
  budgetMs = CLASSIFY_BUDGET_MS,
  trigger: AiTrigger = "script",
): Promise<number> {
  const deadline = Date.now() + budgetMs;
  const pending = await db.leaveEntry.findMany({
    where: { type: null },
    orderBy: { postedOn: "desc" },
    take: limit,
    select: {
      id: true,
      checkin: true,
      postedOn: true,
      postedAt: true,
      message: true,
    },
  });

  let classified = 0;
  let lastRequest = 0;
  for (let offset = 0; offset < pending.length;) {
    // Space requests to stay under the per-minute cap.
    const wait = lastRequest + MIN_REQUEST_GAP_MS - Date.now();
    if (Date.now() + Math.max(wait, 0) + REQUEST_ESTIMATE_MS > deadline) break;
    if (wait > 0) await sleep(wait);

    const batch = pending.slice(offset, offset + BATCH_SIZE);
    lastRequest = Date.now();
    let results;
    try {
      results = await classifyLeavePosts(
        batch.map((entry) => ({
          id: entry.id,
          checkin: entry.checkin === "wfh" ? "wfh" : "leave",
          postedOn: entry.postedOn.toISOString().slice(0, 10),
          postedAt: toIST(entry.postedAt),
          message: entry.message,
        })),
        trigger,
      );
    } catch (error) {
      if (isRateLimit(error)) {
        // Retry the same batch after the window resets.
        lastRequest = Date.now() + RATE_LIMIT_BACKOFF_MS - MIN_REQUEST_GAP_MS;
        continue;
      }
      // Leave the batch unclassified; the next run retries it.
      console.error("[leave-sync] classify batch failed", error);
      offset += BATCH_SIZE;
      continue;
    }

    // One update per row, no transaction: rows are independent, and a batch
    // of 40 in one transaction can outlast Prisma's 5s transaction timeout.
    // `type: null` skips rows HR corrected while the request was running.
    for (const result of results) {
      const startDate = toDate(result.startDate);
      const { count } = await db.leaveEntry.updateMany({
        where: { id: result.id, type: null },
        data: {
          type: result.type,
          startDate,
          endDate: toDate(result.endDate) ?? startDate,
          days: Math.max(0, Math.min(result.days, 99)),
          reason: result.reason || null,
          classifiedBy: "ai",
        },
      });
      classified += count;
    }
    offset += BATCH_SIZE;
  }
  return classified;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRateLimit(error: unknown): boolean {
  const text = String(
    error instanceof Error ? `${error.name} ${error.message}` : error,
  );
  return /rate.?limit|429/i.test(text);
}
