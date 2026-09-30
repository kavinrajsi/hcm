import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/rbac";
import {
  summarizeJobsSync,
  syncBasecampJobs,
  type JobsSyncStreamEvent,
} from "@/lib/assign/jobs-sync";

export const maxDuration = 300;

// Assign → "Sync jobs from Basecamp": pulls completed to-dos and their
// comments, streaming progress as newline-delimited JSON. HR admins only.

export async function POST() {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (user.role !== "HR_ADMIN")
    return new Response("Forbidden", { status: 403 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: JobsSyncStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await syncBasecampJobs(send);
        revalidatePath("/assign");
        send({ type: "done", summary: summarizeJobsSync(result), result });
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
