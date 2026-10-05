import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/rbac";
import {
  summarize,
  syncBasecampPeople,
  type PeopleSyncStreamEvent,
} from "@/lib/basecamp-people";

export const maxDuration = 300;

// Employees → "Sync from Basecamp": runs the people sync and streams its
// progress as newline-delimited JSON, ending with a "done" or "error" line.

export async function POST() {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (user.role !== "HR_ADMIN")
    return new Response("Forbidden", { status: 403 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PeopleSyncStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await syncBasecampPeople(send);
        revalidatePath("/employees");
        revalidatePath("/profile", "layout");
        send({ type: "done", summary: summarize(result), result });
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "Basecamp sync failed",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
