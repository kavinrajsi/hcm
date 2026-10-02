import { db } from "@/lib/db";

// The agreement check: both Client Coordinators label the same jobs,
// separately. Drawing the sample picks them from the train set once; the
// labels page puts them first and marks them "Both".

export const SHARED_SETTING = "assign.sharedJobs";
export const SHARED_SIZE = 30;

/** The stored shared job ids, or [] when none have been picked. */
export function readSharedJobIds(value: unknown): string[] {
  if (value && typeof value === "object" && "jobIds" in value) {
    const ids = (value as { jobIds: unknown }).jobIds;
    if (Array.isArray(ids)) return ids.filter((id): id is string => typeof id === "string");
  }
  return [];
}

/**
 * The shared jobs: the ones already picked if any, else `size` train jobs
 * in random order (Fisher–Yates). Never re-picks, so labels already given
 * on the shared set stay on it.
 */
export function pickSharedJobs(
  trainIds: string[],
  existing: string[],
  size = SHARED_SIZE,
  random: () => number = Math.random,
): string[] {
  if (existing.length > 0) return existing;
  const pool = [...trainIds];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

export async function sharedJobIds(): Promise<string[]> {
  const row = await db.appSetting.findUnique({ where: { key: SHARED_SETTING } });
  return readSharedJobIds(row?.value);
}
