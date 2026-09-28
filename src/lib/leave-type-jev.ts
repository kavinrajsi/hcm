import { experimental_evaluate } from "ai";
import { LEAVE_TYPES, type LeaveTypeValue } from "@/lib/leave";
import { gatewayCost, recordAiUsage, type AiTrigger } from "@/lib/ai-usage";
import type { LeavePost } from "@/lib/leave-classify";

// Leave type from TypeSafe AI's Jev evaluation model (via Vercel AI Gateway).
// Jev answers typed choice questions natively and cheaply, but returns no
// free text, so it only decides the type; dates, days and reason still come
// from the language model in leave-classify.ts. Any failure returns null and
// the language model's type stands. Set LEAVE_TYPE_MODEL=off to disable.

const MODEL = process.env.LEAVE_TYPE_MODEL ?? "typesafe-ai/jev";

/** Below this probability Jev's pick is ignored. */
export const MIN_CONFIDENCE = 0.6;

/** After a failure (e.g. plan limits), skip Jev for a while. */
const BACKOFF_MS = 60 * 60 * 1000;
let skipUntil = 0;

const CRITERIA: Record<LeaveTypeValue, string> = {
  FULL_DAY:
    "Not working one or more whole days: leave, sick, day off, unavailable, at hospital or caring for family without saying they will join later",
  HALF_DAY: "First or second half off, or away for a large part of the day",
  LATE_ARRIVAL: "Coming in late; will reach the office by some time",
  EARLY_LOGOUT: "Leaving early, logging out early, or a hard stop",
  WFH: "Working from home or remotely",
  OTHER: "Anything else: announcements, greetings, unclear posts",
};

function question(post: LeavePost) {
  return {
    type: "choice" as const,
    instructions:
      `Classify the post with id "${post.id}" in state.posts. It was posted in ` +
      `the "${post.checkin}" check-in of an Indian company's Basecamp. ` +
      (post.checkin === "wfh"
        ? "Posts in the WFH check-in are WFH unless the text clearly says otherwise (taking leave, or leaving early and not working the rest of the day)."
        : "This is the leave check-in."),
    criteria: CRITERIA,
  };
}

/**
 * Jev's leave type per post id, only where it is confident. Null when Jev
 * is disabled, backing off, or failed.
 */
export async function jevLeaveTypes(
  posts: LeavePost[],
  trigger?: AiTrigger,
): Promise<Map<string, LeaveTypeValue> | null> {
  if (posts.length === 0 || MODEL === "off" || Date.now() < skipUntil) {
    return null;
  }
  const usage = {
    feature: "leave-type-jev",
    trigger,
    model: MODEL,
    items: posts.length,
  };
  // Question ids must be plain keys; map them back to post ids after.
  const keys = posts.map((_, index) => `post${index}`);
  try {
    const result = await experimental_evaluate({
      model: MODEL,
      maxRetries: 0,
      state: {
        posts: posts.map(({ id, checkin, postedOn, message }) => ({
          id,
          checkin,
          postedOn,
          message,
        })),
      },
      questions: Object.fromEntries(
        posts.map((post, index) => [keys[index], question(post)]),
      ),
    });
    await recordAiUsage({
      ...usage,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      ...gatewayCost(result.providerMetadata),
    });
    const types = new Map<string, LeaveTypeValue>();
    posts.forEach((post, index) => {
      const answer = result.answers[keys[index]];
      if (!answer || answer.type !== "choice") return;
      const choice = answer.choice as LeaveTypeValue;
      const confidence = answer.probabilities?.[choice] ?? 1;
      if (LEAVE_TYPES.includes(choice) && confidence >= MIN_CONFIDENCE) {
        types.set(post.id, choice);
      }
    });
    return types;
  } catch (error) {
    skipUntil = Date.now() + BACKOFF_MS;
    console.error(
      "[leave-type-jev] falling back to the language model:",
      error instanceof Error ? error.message : error,
    );
    await recordAiUsage({ ...usage, ok: false });
    return null;
  }
}

/** Test hook: clear the failure backoff. */
export function resetJevBackoff() {
  skipUntil = 0;
}
