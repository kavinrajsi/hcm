import { db } from "@/lib/db";

// The floor manager writes his beliefs down before he sees any suggestion,
// so the record is checked against a prediction rather than a memory. HR
// names his account here; until he has beliefs on record, suggestions stay
// hidden from him (page and server action).

export const FLOOR_MANAGER_SETTING = "assign.floorManager";

/** The stored floor manager's user id, or null when HR hasn't picked one. */
export function readFloorManagerId(value: unknown): string | null {
  if (value && typeof value === "object" && "userId" in value) {
    const userId = (value as { userId: unknown }).userId;
    if (typeof userId === "string" && userId) return userId;
  }
  return null;
}

/** True when `userId` is the floor manager and has no beliefs written yet. */
export function isSuggestionLocked(
  floorManagerId: string | null,
  userId: string,
  beliefCount: number,
): boolean {
  return floorManagerId === userId && beliefCount === 0;
}

export async function floorManagerId(): Promise<string | null> {
  const row = await db.appSetting.findUnique({ where: { key: FLOOR_MANAGER_SETTING } });
  return readFloorManagerId(row?.value);
}

export async function suggestionsLockedFor(userId: string): Promise<boolean> {
  const managerId = await floorManagerId();
  if (managerId !== userId) return false;
  const beliefs = await db.designerBelief.count({ where: { userId } });
  return isSuggestionLocked(managerId, userId, beliefs);
}
