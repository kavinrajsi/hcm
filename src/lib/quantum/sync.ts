// Quantum Sheet sync: copies Basecamp to-dos (from every To-dos tool), Card
// Table cards and steps into QuantumTodo through the HR admin's Basecamp
// connection. Basecamp lists each type across all projects newest change
// first, so a run only pages back to the last finished sync; completing,
// editing or trashing an item bumps its updated_at, so those changes come
// along too.

import { db } from "@/lib/db";
import { eachPage, getAccessToken } from "@/lib/basecamp";
import { leaveSyncUserId } from "@/lib/leave-sync";
import { istDay } from "@/lib/date-filter";
import {
  hoursToMinutes,
  toQuantumRow,
  type BasecampTimesheetEntry,
  type QuantumKind,
  type BasecampTodoRecording,
} from "./todos";

/** AppSetting: { syncedThrough: ISO instant } — set only when a run finishes. */
export const QUANTUM_SYNC_SETTING = "quantum.sync";

const HISTORY_DAYS = 365;
// Re-reads a few minutes before the last run so edits made mid-run aren't missed.
const OVERLAP_MS = 10 * 60_000;
const STATUSES = ["active", "archived", "trashed"] as const;
/** Each Basecamp type, with its step name in the progress list. */
const KINDS = [
  { kind: "Todo", stage: "todos" },
  { kind: "Kanban::Card", stage: "cards" },
  { kind: "Kanban::Step", stage: "steps" },
] as const satisfies readonly { kind: QuantumKind; stage: string }[];
const USER_AGENT = "HCM Quantum Sheet (internal)";
// Timesheet entries count when logged on something the sheet shows.
const HOURS_PARENTS = new Set(["Todo", "Kanban::Card"]);

/** One step of a running sync, for the page's progress list. */
export type QuantumSyncProgress =
  | {
      stage: (typeof KINDS)[number]["stage"];
      status: (typeof STATUSES)[number];
      pages: number;
      saved: number;
    }
  | { stage: "hours"; hourEntries: number | null };

export type QuantumSyncResult = {
  since: string;
  pages: number;
  saved: number;
  hourEntries: number;
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
 * `full` re-reads the whole 12 months (the first load). `kinds` limits the
 * run to some types (loading a newly added type); such a run leaves the
 * high-water mark alone. Otherwise it only moves when every type and status
 * finishes, so an interrupted run is simply repeated next time.
 */
export async function syncQuantumTodos(
  {
    full = false,
    kinds,
    updatedById,
    onProgress,
  }: {
    full?: boolean;
    kinds?: QuantumKind[];
    updatedById?: string;
    /** Called as each page and step finishes (the Sync button streams these). */
    onProgress?: (progress: QuantumSyncProgress) => void;
  } = {},
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

  for (const { kind, stage } of KINDS) {
    if (kinds && !kinds.includes(kind)) continue;
    // Counts per type, so each line of the progress list reads on its own.
    let kindPages = 0;
    let kindSaved = 0;
    for (const status of STATUSES) {
      onProgress?.({ stage, status, pages: kindPages, saved: kindSaved });
      await eachPage<BasecampTodoRecording>(
        token.accessToken,
        `https://3.basecampapi.com/${token.accountId}/projects/recordings.json?type=${encodeURIComponent(kind)}&status=${status}&sort=updated_at&direction=desc`,
        USER_AGENT,
        async (page) => {
          pages++;
          kindPages++;
          // The trash is tiny (a few pages) and trashing may not bump
          // updated_at, so it's read in full every run.
          const fresh =
            status === "trashed" ? page : page.filter((todo) => todo.updated_at >= sinceIso);
          if (fresh.length) {
            // Independent upserts, so no transaction: a batch on Neon can
            // outlast Prisma's 5-second transaction limit, and a rerun
            // repairs any half-saved page.
            await Promise.all(
              fresh.map((todo) => {
                const row = toQuantumRow({ ...todo, type: todo.type ?? kind });
                return db.quantumTodo.upsert({
                  where: { basecampId: row.basecampId },
                  create: row,
                  update: row,
                });
              }),
            );
            // Re-read trash that hasn't changed isn't news.
            const changed = fresh.filter((todo) => todo.updated_at >= sinceIso).length;
            saved += changed;
            kindSaved += changed;
          }
          onProgress?.({ stage, status, pages: kindPages, saved: kindSaved });
          // Sorted newest first: once a page reaches past `since`, the rest is older.
          return status !== "trashed" && (fresh.length < page.length || page.length === 0);
        },
      );
    }
  }

  onProgress?.({ stage: "hours", hourEntries: null });
  const hourEntries = await syncTimesheetHours(token, startedAt);
  onProgress?.({ stage: "hours", hourEntries });

  if (kinds) return { since: sinceIso, pages, saved, hourEntries };
  const value = { syncedThrough: startedAt.toISOString() };
  await db.appSetting.upsert({
    where: { key: QUANTUM_SYNC_SETTING },
    create: { key: QUANTUM_SYNC_SETTING, value, updatedById },
    update: { value, updatedById: updatedById ?? null },
  });
  return { since: sinceIso, pages, saved, hourEntries };
}

/**
 * Basecamp Timesheet hours logged on to-dos and cards in the last 12 months. The team
 * logs few entries, so the whole year is one request; entries deleted in
 * Basecamp are dropped here too.
 */
export async function syncTimesheetHours(
  token: { accessToken: string; accountId: string },
  now: Date,
): Promise<number> {
  const startDay = istDay(new Date(now.getTime() - HISTORY_DAYS * 86_400_000));
  const entries: BasecampTimesheetEntry[] = [];
  await eachPage<BasecampTimesheetEntry>(
    token.accessToken,
    `https://3.basecampapi.com/${token.accountId}/reports/timesheet.json?start_date=${startDay}&end_date=${istDay(now)}`,
    USER_AGENT,
    (page) => {
      entries.push(...page);
    },
  );
  const onTodos = entries.filter(
    (entry) =>
      HOURS_PARENTS.has(entry.parent?.type) && entry.status === "active" && hoursToMinutes(entry.hours) > 0,
  );
  await Promise.all(
    onTodos.map((entry) => {
      const row = {
        todoBasecampId: String(entry.parent.id),
        source: "basecamp",
        personName: entry.person?.name ?? null,
        personId: entry.person ? String(entry.person.id) : null,
        note: entry.description?.trim() ? entry.description.trim().slice(0, 2000) : null,
        date: new Date(`${entry.date}T00:00:00Z`),
        minutes: hoursToMinutes(entry.hours),
      };
      return db.quantumHours.upsert({
        where: { basecampEntryId: String(entry.id) },
        create: { ...row, basecampEntryId: String(entry.id) },
        update: row,
      });
    }),
  );
  await db.quantumHours.deleteMany({
    where: {
      source: "basecamp",
      date: { gte: new Date(`${startDay}T00:00:00Z`) },
      basecampEntryId: { notIn: onTodos.map((entry) => String(entry.id)) },
    },
  });
  return onTodos.length;
}
