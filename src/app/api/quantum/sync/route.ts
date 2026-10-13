import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/rbac";
import {
  lastQuantumSync,
  syncQuantumTodos,
  type QuantumSyncProgress,
} from "@/lib/quantum/sync";

export const maxDuration = 300;

// Quantum Sheet "Sync from Basecamp": runs the incremental sync and streams
// each step as a line of JSON (newline-delimited) so the button can show
// what's happening. HR and managers only.

export type QuantumSyncEvent =
  | ({ type: "progress" } & QuantumSyncProgress)
  | { type: "done"; saved: number; hourEntries: number }
  | { type: "error"; message: string };

export async function POST() {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (user.role !== "HR_ADMIN" && user.role !== "MANAGER")
    return new Response("Forbidden", { status: 403 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: QuantumSyncEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        // The first 12-month load is thousands of Basecamp calls; it runs
        // as a one-off script, never from the button.
        if (!(await lastQuantumSync())) {
          send({ type: "error", message: "The first load from Basecamp hasn't run yet." });
          return;
        }
        const result = await syncQuantumTodos({
          updatedById: user.id,
          onProgress: (progress) => send({ type: "progress", ...progress }),
        });
        revalidatePath("/quantum");
        send({ type: "done", saved: result.saved, hourEntries: result.hourEntries });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Sync failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
