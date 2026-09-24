import { generateText, Output } from "ai";
import { z } from "zod";
import { LEAVE_TYPES } from "@/lib/leave";

// Classifies free-text leave posts via Vercel AI Gateway. Auth comes from
// AI_GATEWAY_API_KEY or the Vercel OIDC token (VERCEL_OIDC_TOKEN).

const MODEL = process.env.LEAVE_AI_MODEL ?? "google/gemini-2.5-flash-lite";

export type LeavePost = {
  id: string;
  postedOn: string; // YYYY-MM-DD check-in day
  postedAt: string; // ISO timestamp
  message: string;
};

const resultSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      type: z.enum(LEAVE_TYPES),
      startDate: z.string().describe("YYYY-MM-DD"),
      endDate: z.string().describe("YYYY-MM-DD, same as startDate for one day"),
      days: z
        .number()
        .describe("Working days absent: 1 per full day, 0.5 half day, 0 for late/early/WFH"),
      reason: z.string().describe("Short reason, max 8 words, or empty"),
    }),
  ),
});

export type LeaveClassification = z.infer<typeof resultSchema>["items"][number];

const SYSTEM = `You classify posts from an Indian company's "Post your leave here" check-in.
Timezone Asia/Kolkata. Work week Monday–Friday.
Types:
- FULL_DAY: not working one or more whole days (leave, sick, day off, not available today).
- HALF_DAY: first or second half off, or away for a large part of the day.
- LATE_ARRIVAL: coming in late, will reach office by some time.
- EARLY_LOGOUT: leaving early, logging out early, hard stop.
- WFH: working from home / remote.
- OTHER: anything else (announcements, greetings, unclear).
Someone who says they are unavailable, at a hospital, or caring for family, without
saying they will join later, is FULL_DAY.
Resolve relative dates ("today", "tomorrow", "Monday", "6th Oct") against the post's
postedAt timestamp. If no date is mentioned, use postedOn.
startDate = first day mentioned, endDate = last day mentioned.
days = number of working days actually absent, NOT the span between dates:
"23rd Sep and 16th Oct" is 2 days; "Mon to Wed" is 3 days.
Return one item per post, using the same id.`;

export async function classifyLeavePosts(
  posts: LeavePost[],
): Promise<LeaveClassification[]> {
  if (posts.length === 0) return [];
  const { output } = await generateText({
    model: MODEL,
    maxRetries: 0, // caller paces requests and handles rate limits
    system: SYSTEM,
    output: Output.object({ schema: resultSchema }),
    prompt: JSON.stringify(posts),
  });
  const ids = new Set(posts.map((p) => p.id));
  return output.items.filter((i) => ids.has(i.id));
}
