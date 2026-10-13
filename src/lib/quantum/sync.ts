// Quantum Sheet sync: copies Basecamp to-dos into QuantumTodo through the HR
// admin's Basecamp connection. Basecamp lists every project's to-dos newest
// change first (15 per page), so a run only pages back to the last finished
// sync; completing, editing or trashing a to-do bumps its updated_at, so
// those changes come along too.

import { db } from "@/lib/db";
import { eachPage, getAccessToken } from "@/lib/basecamp";
import { leaveSyncUserId } from "@/lib/leave-sync";
import { toQuantumRow, type BasecampTodoRecording } from "./todos";

/** AppSetting: { syncedThrough: ISO instant } — set only when a run finishes. */
export const QUANTUM_SYNC_SETTING = "quantum.sync";

const HISTORY_DAYS = 365;
// Re-reads a few minutes before the last run so edits made mid-run aren't missed.
const OVERLAP_MS = 10 * 60_000;
const STATUSES = ["active", "archived", "trashed"] as const;
const USER_AGENT = "HCM Quantum Sheet (internal)";

export type QuantumSyncResult = {
  since: string;
  pages: number;
  saved: number;
};

/** Where this run starts: the last finished sync, never further back than 12 months. */
export function syncStart(syncedThrough: string | undefined, now: Date, full = false): Date {
  const floor = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  if (full || !syncedThrough) return floor;
  const last = new Date(new Date(syncedThrough).getTime() - OVERLAP_MS);
  return Number.isNaN(last.getTime()) || last < floor ? floor : last;
}

export async function lastQuantumSync(): Promise<Date | null> {
  const setting = await db.appSetting.findUnique({ where: { key: QUANTUM_SYNC_SETTING } });
  const value = (setting?.value as { syncedThrough?: string } | null)?.syncedThrough;
  return value ? new Date(value) : null;
}

/**
 * `full` re-reads the whole 12 months (the first load). The high-water mark
 * only moves when every status finishes, so an interrupted run is simply
 * repeated next time.
 */
export async function syncQuantumTodos(
  { full = false, updatedById }: { full?: boolean; updatedById?: string } = {},
): Promise<QuantumSyncResult> {
  const userId = await leaveSyncUserId();
  const token = userId && (await getAccessToken(userId));
  if (!token) throw new Error("No HR admin has connected Basecamp");

  const startedAt = new Date();
  const last = await lastQuantumSync();
  const since = syncStart(last?.toISOString(), startedAt, full);
  const sinceIso = since.toISOString();
  let pages = 0;
  let saved = 0;

  for (const status of STATUSES) {
    await eachPage<BasecampTodoRecording>(
      token.accessToken,
      `https://3.basecampapi.com/${token.accountId}/projects/recordings.json?type=Todo&status=${status}&sort=updated_at&direction=desc`,
      USER_AGENT,
      async (page) => {
        pages++;
        // The trash is tiny (a few pages) and trashing may not bump
        // updated_at, so it's read in full every run.
        const fresh =
          status === "trashed" ? page : page.filter((todo) => todo.updated_at >= sinceIso);
        if (fresh.length) {
          // Independent upserts, so no transaction: a batch on Neon can
          // outlast Prisma's 5-second transaction limit, and a rerun repairs
          // any half-saved page.
          await Promise.all(
            fresh.map((todo) => {
              const row = toQuantumRow(todo);
              return db.quantumTodo.upsert({
                where: { basecampId: row.basecampId },
                create: row,
                update: row,
              });
            }),
          );
          // Re-read trash that hasn't changed isn't news.
          saved += fresh.filter((todo) => todo.updated_at >= sinceIso).length;
        }
        // Sorted newest first: once a page reaches past `since`, the rest is older.
        return status !== "trashed" && (fresh.length < page.length || page.length === 0);
      },
    );
  }

  const value = { syncedThrough: startedAt.toISOString() };
  await db.appSetting.upsert({
    where: { key: QUANTUM_SYNC_SETTING },
    create: { key: QUANTUM_SYNC_SETTING, value, updatedById },
    update: { value, updatedById: updatedById ?? null },
  });
  return { since: sinceIso, pages, saved };
}
