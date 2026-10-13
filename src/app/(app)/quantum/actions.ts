"use server";

// Quantum Sheet: "Sync from Basecamp" pulls to-dos changed since the last sync.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/rbac";
import { lastQuantumSync, syncQuantumTodos } from "@/lib/quantum/sync";

export type QuantumSyncState = { error?: string; ok?: string };

export async function syncQuantum(): Promise<QuantumSyncState> {
  const user = await requireRole("HR_ADMIN", "MANAGER");
  // The first 12-month load is thousands of Basecamp calls; it runs as a
  // one-off script, never from a button.
  if (!(await lastQuantumSync())) {
    return { error: "The first load from Basecamp hasn't run yet." };
  }
  try {
    const result = await syncQuantumTodos({ updatedById: user.id });
    revalidatePath("/quantum");
    return {
      ok:
        result.saved === 0
          ? "Up to date."
          : `Updated ${result.saved} to-do${result.saved === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Sync failed" };
  }
}
