import { timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { checkinKind, leaveCheckinConfig } from "@/lib/basecamp";
import {
  classifyPending,
  leaveSyncUserId,
  syncOneAnswer,
} from "@/lib/leave-sync";

// Basecamp webhook for the "Post your leave here" and "Post your WFH here"
// check-ins: a new or edited answer lands on the Leave page within seconds instead of at the next daily
// sync. Basecamp doesn't sign webhooks, so the payload URL carries a secret
// (?token=BASECAMP_WEBHOOK_SECRET) and the answer itself is re-fetched from
// the API rather than trusted. Registered by scripts/register-leave-webhook.ts.

export const maxDuration = 60;

// Events that mean "this answer exists / changed" — trash, archive etc. are
// ignored, the same as the daily sync (it never deletes rows).
const UPSERT_KINDS = new Set([
  "question_answer_created",
  "question_answer_active",
  "question_answer_content_updated",
  "question_answer_untrashed",
  "question_answer_unarchived",
]);

function validToken(given: string | null): boolean {
  const secret = process.env.BASECAMP_WEBHOOK_SECRET;
  if (!secret || !given) return false;
  const givenBuffer = Buffer.from(given);
  const secretBuffer = Buffer.from(secret);
  return (
    givenBuffer.length === secretBuffer.length &&
    timingSafeEqual(givenBuffer, secretBuffer)
  );
}

type Payload = {
  kind?: string;
  recording?: {
    id?: number;
    type?: string;
    parent?: { id?: number };
    bucket?: { id?: number };
  };
};

export async function POST(request: NextRequest) {
  if (!validToken(request.nextUrl.searchParams.get("token"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Payload | null;
  const recording = payload?.recording;
  const { bucketId } = leaveCheckinConfig();
  const relevant =
    payload?.kind &&
    UPSERT_KINDS.has(payload.kind) &&
    recording?.type === "Question::Answer" &&
    recording.id &&
    String(recording.bucket?.id) === bucketId &&
    checkinKind(recording.parent?.id) !== null;
  // Anything else is acknowledged, so Basecamp doesn't retry or deactivate.
  if (!relevant) return Response.json({ ignored: true });

  const userId = await leaveSyncUserId();
  if (!userId) {
    return Response.json({ error: "Basecamp not connected" }, { status: 503 });
  }

  // Errors → 5xx so Basecamp retries (up to 10 times, backing off).
  const result = await syncOneAnswer(userId, String(recording.id));

  // Reply now; AI-classify the new/edited post after the response.
  after(async () => {
    try {
      await classifyPending(10, 45_000, "webhook");
    } catch (error) {
      console.error("[basecamp-webhook] classify failed", error);
    }
  });

  return Response.json(result);
}
