import { db } from "@/lib/db";
import {
  getAccessToken,
  leaveCheckinConfig,
  listCheckinAnswers,
} from "@/lib/basecamp";
import { buildEmailIndex, htmlToText } from "@/lib/leave";
import { classifyLeavePosts } from "@/lib/leave-classify";

// Pulls the Basecamp leave check-in into LeaveEntry and AI-classifies new
// rows. First run imports full history; later runs re-read the last 14 days
// (catches edits and late posts). Classification is capped per run so a run
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
): Promise<LeaveSyncResult> {
  const auth = await getAccessToken(userId);
  if (!auth) throw new Error("Basecamp not connected — connect it first");

  const hasRows = (await db.leaveEntry.count()) > 0;
  const sinceDay = hasRows
    ? new Date(Date.now() - RESYNC_DAYS * 86_400_000).toISOString().slice(0, 10)
    : undefined;

  const { accountId, bucketId, questionId } = leaveCheckinConfig();
  const answers = await listCheckinAnswers(
    auth.accessToken,
    accountId,
    bucketId,
    questionId,
    sinceDay,
  );

  const employees = await db.employee.findMany({
    select: { id: true, workEmail: true, personalEmail: true },
  });
  const emailIndex = buildEmailIndex(employees);

  const existing = new Map(
    (
      await db.leaveEntry.findMany({
        where: { basecampId: { in: answers.map((a) => String(a.id)) } },
        select: { id: true, basecampId: true, message: true, classifiedBy: true },
      })
    ).map((e) => [e.basecampId, e]),
  );

  const toCreate = [];
  let updated = 0;
  for (const a of answers) {
    const email = a.creator.email_address?.toLowerCase() ?? "";
    const row = {
      employeeId: emailIndex.get(email) ?? null,
      creatorName: a.creator.name,
      creatorEmail: email,
      postedOn: new Date(a.group_on),
      postedAt: new Date(a.created_at),
      message: htmlToText(a.content),
      link: a.app_url,
    };
    const prev = existing.get(String(a.id));
    if (!prev) {
      toCreate.push({ basecampId: String(a.id), ...row });
    } else if (prev.message !== row.message) {
      // Edited post: re-classify unless HR corrected it by hand.
      await db.leaveEntry.update({
        where: { id: prev.id },
        data:
          prev.classifiedBy === "manual"
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
  for (const u of unmatched) {
    const employeeId = emailIndex.get(u.creatorEmail);
    if (employeeId) {
      await db.leaveEntry.update({ where: { id: u.id }, data: { employeeId } });
    }
  }

  const classified = await classifyPending(CLASSIFY_PER_RUN);
  const remaining = await db.leaveEntry.count({ where: { type: null } });
  return { fetched: answers.length, created, updated, classified, remaining };
}

/** ISO timestamp in Asia/Kolkata so "today"/"tomorrow" resolve correctly. */
function toIST(d: Date): string {
  return new Date(d.getTime() + 330 * 60_000).toISOString().replace("Z", "+05:30");
}

function toDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Classifies unclassified rows, newest first, one request at a time — the
 * AI Gateway free tier allows 5 requests/min. Stops at `limit` rows or when
 * `budgetMs` runs out (keeps a sync inside the function time limit).
 */
export async function classifyPending(
  limit: number,
  budgetMs = CLASSIFY_BUDGET_MS,
): Promise<number> {
  const deadline = Date.now() + budgetMs;
  const pending = await db.leaveEntry.findMany({
    where: { type: null },
    orderBy: { postedOn: "desc" },
    take: limit,
    select: { id: true, postedOn: true, postedAt: true, message: true },
  });

  let classified = 0;
  let lastRequest = 0;
  for (let i = 0; i < pending.length; ) {
    // Space requests to stay under the per-minute cap.
    const wait = lastRequest + MIN_REQUEST_GAP_MS - Date.now();
    if (Date.now() + Math.max(wait, 0) + REQUEST_ESTIMATE_MS > deadline) break;
    if (wait > 0) await sleep(wait);

    const batch = pending.slice(i, i + BATCH_SIZE);
    lastRequest = Date.now();
    let results;
    try {
      results = await classifyLeavePosts(
        batch.map((p) => ({
          id: p.id,
          postedOn: p.postedOn.toISOString().slice(0, 10),
          postedAt: toIST(p.postedAt),
          message: p.message,
        })),
      );
    } catch (err) {
      if (isRateLimit(err)) {
        // Retry the same batch after the window resets.
        lastRequest = Date.now() + RATE_LIMIT_BACKOFF_MS - MIN_REQUEST_GAP_MS;
        continue;
      }
      // Leave the batch unclassified; the next run retries it.
      console.error("[leave-sync] classify batch failed", err);
      i += BATCH_SIZE;
      continue;
    }

    await db.$transaction(
      results.map((r) => {
        const startDate = toDate(r.startDate);
        return db.leaveEntry.update({
          where: { id: r.id },
          data: {
            type: r.type,
            startDate,
            endDate: toDate(r.endDate) ?? startDate,
            days: Math.max(0, Math.min(r.days, 99)),
            reason: r.reason || null,
            classifiedBy: "ai",
          },
        });
      }),
    );
    classified += results.length;
    i += BATCH_SIZE;
  }
  return classified;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimit(err: unknown): boolean {
  const text = String(err instanceof Error ? `${err.name} ${err.message}` : err);
  return /rate.?limit|429/i.test(text);
}
