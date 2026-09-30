import { generateText, Output } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { gatewayCost, recordAiUsage, type AiTrigger } from "@/lib/ai-usage";
import {
  COMMENT_CATEGORIES,
  COMMENT_CATEGORY_HINTS,
  JOB_KINDS,
  JOB_KIND_HINTS,
  normalizeCategories,
  type CommentCategory,
  type JobKind,
} from "@/lib/assign/taxonomy";

// The two judgement calls a model makes for Assignment Intelligence, both
// through Vercel AI Gateway: what kind of design a job is, and what each
// comment on a job is doing (correction vs client change vs …). Counting
// and comparing designers is ordinary code (suggest.ts) on purpose.

const MODEL = process.env.ASSIGN_AI_MODEL ?? "google/gemini-2.5-flash-lite";
const BATCH_SIZE = 40;
// Free-tier gateway: 5 requests/min → one request every 13s is safe.
const MIN_REQUEST_GAP_MS = 13_000;
const RATE_LIMIT_BACKOFF_MS = 60_000;
const REQUEST_ESTIMATE_MS = 20_000;
const FEW_SHOT_EXAMPLES = 30;

// --- Job kind ---

export type JobForKind = {
  id: string;
  title: string;
  description: string;
  bucketName: string;
  todolistTitle: string;
};

const kindSchema = z.object({
  items: z.array(z.object({ id: z.string(), kind: z.enum(JOB_KINDS) })),
});

const KIND_SYSTEM = `You classify to-dos from an Indian advertising agency's Basecamp into the kind of design work each one is.
The to-do title is usually the best clue; the project (client) and list names add context.
Kinds:
${JOB_KINDS.map((kind) => `- ${kind}: ${JOB_KIND_HINTS[kind]}`).join("\n")}
Return one item per to-do, using the same id.`;

export async function classifyJobKinds(
  jobs: JobForKind[],
  trigger?: AiTrigger,
): Promise<{ id: string; kind: JobKind }[]> {
  if (jobs.length === 0) return [];
  const usage = { feature: "assign-kind", trigger, model: MODEL, items: jobs.length };
  let result;
  try {
    result = await generateText({
      model: MODEL,
      maxRetries: 0,
      system: KIND_SYSTEM,
      output: Output.object({ schema: kindSchema }),
      prompt: JSON.stringify(
        jobs.map((job) => ({
          id: job.id,
          title: job.title,
          project: job.bucketName,
          list: job.todolistTitle,
          description: job.description.slice(0, 600),
        })),
      ),
    });
  } catch (error) {
    await recordAiUsage({ ...usage, ok: false });
    throw error;
  }
  await recordAiUsage({
    ...usage,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    ...gatewayCost(result.providerMetadata),
  });
  const ids = new Set(jobs.map((job) => job.id));
  return result.output.items.filter((item) => ids.has(item.id));
}

/** The kind of one new job description (the Assign page's question). */
export async function classifyDescription(
  description: string,
  trigger?: AiTrigger,
): Promise<JobKind> {
  const [item] = await classifyJobKinds(
    [
      {
        id: "new",
        title: description.split("\n")[0]?.slice(0, 120) ?? "",
        description,
        bucketName: "",
        todolistTitle: "",
      },
    ],
    trigger,
  );
  return item?.kind ?? "other";
}

// --- Comment categories ---

export type CommentForLabel = {
  id: string;
  jobTitle: string;
  author: string;
  role: "designer" | "coordinator" | "other"; // who wrote it
  text: string;
};

export type LabelledExample = { text: string; role: string; labels: string[] };

const labelSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      labels: z
        .array(z.enum(COMMENT_CATEGORIES))
        .describe("Every category that applies; at least one"),
    }),
  ),
});

export function commentSystemPrompt(examples: LabelledExample[]): string {
  const shots = examples
    .slice(0, FEW_SHOT_EXAMPLES)
    .map(
      (example) =>
        `- (${example.role}) "${example.text.slice(0, 240).replace(/\s+/g, " ")}" → ${example.labels.join(", ")}`,
    )
    .join("\n");
  return `You read comments on design to-dos in an Indian advertising agency's Basecamp and say what each comment is doing.
Comments are short, informal, often in Indian English shorthand, sometimes with @mentions or only an attachment name.
A comment can do several things at once; return every category that applies.
Categories:
${COMMENT_CATEGORIES.map((category) => `- ${category}: ${COMMENT_CATEGORY_HINTS[category]}`).join("\n")}
The difference that matters most: CORRECTION means the designer got something wrong or below the brief; CLIENT_CHANGE means the client or coordinator changed the ask. When a comment only asks for a change without saying why, and the change is about something the brief already covered (logo, spelling, size, brand colour), it is a CORRECTION; a new idea or a changed preference is a CLIENT_CHANGE.
A comment that is just a file name, a link, "done", "updated", "please check" or a closing note is HANDOFF.
"role" says who wrote the comment: the designer assigned to the to-do, the coordinator who raised it, or someone else.
${shots ? `Examples the Client Coordinators labelled:\n${shots}\n` : ""}Return one item per comment, using the same id.`;
}

export async function classifyComments(
  comments: CommentForLabel[],
  examples: LabelledExample[] = [],
  trigger?: AiTrigger,
): Promise<{ id: string; labels: CommentCategory[] }[]> {
  if (comments.length === 0) return [];
  const usage = {
    feature: "assign-comments",
    trigger,
    model: MODEL,
    items: comments.length,
  };
  let result;
  try {
    result = await generateText({
      model: MODEL,
      maxRetries: 0,
      system: commentSystemPrompt(examples),
      output: Output.object({ schema: labelSchema }),
      prompt: JSON.stringify(
        comments.map((comment) => ({
          id: comment.id,
          todo: comment.jobTitle,
          role: comment.role,
          author: comment.author,
          text: comment.text.slice(0, 1200),
        })),
      ),
    });
  } catch (error) {
    await recordAiUsage({ ...usage, ok: false });
    throw error;
  }
  await recordAiUsage({
    ...usage,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    ...gatewayCost(result.providerMetadata),
  });
  const ids = new Set(comments.map((comment) => comment.id));
  return result.output.items
    .filter((item) => ids.has(item.id))
    .map((item) => {
      const labels = normalizeCategories(item.labels);
      return { id: item.id, labels: labels.length ? labels : ["OTHER"] };
    });
}

// --- Pending work, paced for the Gateway free tier ---

export type ClassifyProgress = { jobs: number; comments: number; remaining: { jobs: number; comments: number } };

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRateLimit(error: unknown): boolean {
  const text = String(
    error instanceof Error ? `${error.name} ${error.message}` : error,
  );
  return /rate.?limit|429/i.test(text);
}

/**
 * Runs `work` over batches of `items`, one request at a time with the
 * Gateway's per-minute cap in mind, until `deadline`. Returns how many
 * items were handed to `work` successfully.
 */
async function runPaced<T>(
  items: T[],
  deadline: number,
  work: (batch: T[]) => Promise<number>,
  label: string,
): Promise<number> {
  let done = 0;
  let lastRequest = 0;
  for (let offset = 0; offset < items.length; ) {
    const wait = lastRequest + MIN_REQUEST_GAP_MS - Date.now();
    if (Date.now() + Math.max(wait, 0) + REQUEST_ESTIMATE_MS > deadline) break;
    if (wait > 0) await sleep(wait);
    const batch = items.slice(offset, offset + BATCH_SIZE);
    lastRequest = Date.now();
    try {
      done += await work(batch);
    } catch (error) {
      if (isRateLimit(error)) {
        lastRequest = Date.now() + RATE_LIMIT_BACKOFF_MS - MIN_REQUEST_GAP_MS;
        continue;
      }
      console.error(`[assign] ${label} batch failed`, error);
    }
    offset += BATCH_SIZE;
  }
  return done;
}

/** Coordinator-labelled comments from the training set, for the prompt. */
export async function trainingExamples(): Promise<LabelledExample[]> {
  const rows = await db.commentLabel.findMany({
    where: { comment: { job: { evalSet: "train" } } },
    orderBy: { updatedAt: "desc" },
    take: FEW_SHOT_EXAMPLES * 2,
    select: {
      labels: true,
      comment: {
        select: {
          content: true,
          authorPersonId: true,
          job: {
            select: {
              creatorPersonId: true,
              assignees: { select: { personId: true } },
            },
          },
        },
      },
    },
  });
  const seen = new Set<string>();
  const examples: LabelledExample[] = [];
  for (const row of rows) {
    const text = row.comment.content.trim();
    if (!text || seen.has(text) || row.labels.length === 0) continue;
    seen.add(text);
    examples.push({
      text,
      role: commentRole(row.comment.authorPersonId, row.comment.job),
      labels: row.labels,
    });
  }
  return examples;
}

export function commentRole(
  authorPersonId: string,
  job: { creatorPersonId: string; assignees: { personId: string }[] },
): CommentForLabel["role"] {
  if (job.assignees.some((assignee) => assignee.personId === authorPersonId))
    return "designer";
  if (job.creatorPersonId === authorPersonId) return "coordinator";
  return "other";
}

/**
 * Classifies jobs without a kind and comments without AI labels, newest
 * first, inside `budgetMs`. Holdout jobs are classified too (the AI never
 * sees the coordinators' holdout labels; the eval page hides its scores
 * until asked).
 */
export async function classifyPending(
  budgetMs: number,
  trigger: AiTrigger = "script",
  limit = 2000,
): Promise<ClassifyProgress> {
  const deadline = Date.now() + budgetMs;

  const jobs = await db.job.findMany({
    where: { kind: null },
    orderBy: { completedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      description: true,
      bucketName: true,
      todolistTitle: true,
    },
  });
  const jobsDone = await runPaced(
    jobs,
    deadline,
    async (batch) => {
      const results = await classifyJobKinds(batch, trigger);
      let count = 0;
      for (const item of results) {
        // `kind: null` skips jobs someone set by hand meanwhile.
        const updated = await db.job.updateMany({
          where: { id: item.id, kind: null },
          data: { kind: item.kind, kindBy: "ai" },
        });
        count += updated.count;
      }
      return count;
    },
    "kind",
  );

  const comments = await db.jobComment.findMany({
    where: { aiLabelledAt: null },
    orderBy: { postedAt: "desc" },
    take: limit,
    select: {
      id: true,
      content: true,
      authorName: true,
      authorPersonId: true,
      job: {
        select: {
          title: true,
          creatorPersonId: true,
          assignees: { select: { personId: true } },
        },
      },
    },
  });
  const examples = comments.length ? await trainingExamples() : [];
  const commentsDone = await runPaced(
    comments,
    deadline,
    async (batch) => {
      const results = await classifyComments(
        batch.map((comment) => ({
          id: comment.id,
          jobTitle: comment.job.title,
          author: comment.authorName,
          role: commentRole(comment.authorPersonId, comment.job),
          text: comment.content,
        })),
        examples,
        trigger,
      );
      const now = new Date();
      for (const item of results) {
        await db.jobComment.update({
          where: { id: item.id },
          data: { aiLabels: item.labels, aiLabelledAt: now },
        });
      }
      return results.length;
    },
    "comments",
  );

  const [remainingJobs, remainingComments] = await Promise.all([
    db.job.count({ where: { kind: null } }),
    db.jobComment.count({ where: { aiLabelledAt: null } }),
  ]);
  return {
    jobs: jobsDone,
    comments: commentsDone,
    remaining: { jobs: remainingJobs, comments: remainingComments },
  };
}
