import { createHmac } from "node:crypto";
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/rbac";
import { gatewayCost, recordAiUsage } from "@/lib/ai-usage";
import { DEFAULT_MODEL, MADMAX_MODELS, modelByKey } from "@/lib/madmax/models";
import { WRITE_TOOLS, buildTools, loadContext } from "@/lib/madmax/tools";
import { systemPrompt } from "@/lib/madmax/prompt";
import {
  findOwnThread,
  loadMessages,
  saveMessages,
  titleFrom,
} from "@/lib/madmax/store";

// MadMax chat endpoint. The client sends only the newest message; history
// comes from the database. Write tools pause for the user's approval, and
// approvals are HMAC-signed so a modified client can't forge one.

export const maxDuration = 120;

const bodySchema = z.object({
  id: z.string().regex(/^[\w-]{8,64}$/),
  model: z.string().optional(),
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.enum(["user", "assistant"]),
    parts: z.array(z.unknown()),
  }),
});

function approvalSecret(): string | undefined {
  const secret = process.env.AUTH_SECRET;
  return secret
    ? createHmac("sha256", secret).update("madmax-tool-approval").digest("hex")
    : undefined;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { id: threadId, message } = parsed.data;

  // New thread on first message; someone else's thread is "not found".
  // Requests without a model (auto-send after an approval) keep the
  // thread's model.
  let thread = await findOwnThread(threadId, user.id);
  const model =
    modelByKey(parsed.data.model) ??
    MADMAX_MODELS.find((option) => option.id === thread?.model) ??
    modelByKey(DEFAULT_MODEL)!;
  if (!thread) {
    if (await db.chatThread.findUnique({ where: { id: threadId } })) {
      return new Response("Not found", { status: 404 });
    }
    if (message.role !== "user") {
      return new Response("Bad request", { status: 400 });
    }
    thread = await db.chatThread.create({
      data: {
        id: threadId,
        userId: user.id,
        title: titleFrom(message as UIMessage),
        model: model.id,
      },
    });
  } else if (thread.model !== model.id) {
    await db.chatThread.update({
      where: { id: threadId },
      data: { model: model.id },
    });
  }

  // A message id may only exist in this thread (never overwrite others').
  const existing = await db.chatMessage.findUnique({
    where: { id: message.id },
    select: { threadId: true },
  });
  if (existing && existing.threadId !== threadId) {
    return new Response("Bad request", { status: 400 });
  }

  // Assistant messages come back only to carry approval responses, so they
  // must replace a message we already stored.
  const previous = await loadMessages(threadId);
  const index = previous.findIndex((stored) => stored.id === message.id);
  if (message.role === "assistant" && index === -1) {
    return new Response("Bad request", { status: 400 });
  }
  const merged =
    index === -1
      ? [...previous, message as UIMessage]
      : previous.map((stored, position) =>
          position === index ? (message as UIMessage) : stored,
        );

  const context = await loadContext(user);
  const tools = buildTools(context);
  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: merged, tools });
  } catch {
    return new Response("Invalid messages", { status: 400 });
  }

  const toolApproval = Object.fromEntries(
    WRITE_TOOLS.filter((name) => name in tools).map((name) => [
      name,
      "user-approval" as const,
    ]),
  );

  const result = streamText({
    model: model.id,
    system: systemPrompt(context),
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    toolApproval,
    experimental_toolApprovalSecret: approvalSecret(),
    stopWhen: isStepCount(8),
    onEnd: async ({ totalUsage, steps }) => {
      const cost = steps.reduce<{
        costUsd: number | null;
        generationId: string | null;
      }>(
        (sum, step) => {
          const stepCost = gatewayCost(step.providerMetadata);
          return {
            costUsd:
              stepCost.costUsd === null
                ? sum.costUsd
                : (sum.costUsd ?? 0) + stepCost.costUsd,
            generationId: stepCost.generationId ?? sum.generationId,
          };
        },
        { costUsd: null, generationId: null },
      );
      await recordAiUsage({
        feature: "madmax",
        model: model.id,
        items: 1,
        inputTokens: totalUsage.inputTokens ?? 0,
        outputTokens: totalUsage.outputTokens ?? 0,
        ...cost,
      });
    },
    onError: async ({ error }) => {
      console.error("[madmax] model error", error);
      await recordAiUsage({
        feature: "madmax",
        model: model.id,
        items: 1,
        ok: false,
      });
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: messages,
      // Server-side ids, so an approval sent back matches the stored message.
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      onError: (error) => {
        console.error("[madmax] stream error", error);
        if (!(error instanceof Error)) return "MadMax hit an error. Try again.";
        if (/free tier/i.test(error.message)) {
          return `${model.label} needs paid Vercel AI Gateway credits. Pick another model, or top up credits.`;
        }
        // Tool input and scope errors are ours and safe to show; database
        // and provider errors stay generic.
        if (
          /prisma|database|ECONN|fetch failed/i.test(error.name + error.message)
        ) {
          return "MadMax hit an error. Try again.";
        }
        return error.message.slice(0, 200);
      },
      onEnd: async ({ messages: finalMessages }) => {
        await saveMessages(threadId, finalMessages);
      },
    }),
  });
}
