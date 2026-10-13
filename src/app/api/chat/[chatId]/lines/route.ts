import { z } from "zod";
import { currentUser } from "@/lib/rbac";
import { db } from "@/lib/db";
import { BasecampNotConnectedError, refreshChatIfStale, sendChatLine } from "@/lib/chat/sync";
import { messagesAfter, messagesBefore, toMessages } from "@/lib/chat/messages";

export const maxDuration = 60;

// Chat page: GET polls one chat (?after=ISO for new messages, ?before=ISO
// for older ones); POST sends a message as the signed-in person through
// their own Basecamp connection. HR and managers only.

async function teamUser() {
  const user = await currentUser();
  if (!user) return { error: new Response("Not signed in", { status: 401 }) };
  if (user.role !== "HR_ADMIN" && user.role !== "MANAGER")
    return { error: new Response("Forbidden", { status: 403 }) };
  return { user };
}

async function chatExists(chatId: string) {
  return (await db.basecampChat.count({ where: { basecampId: chatId } })) > 0;
}

export async function GET(request: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const { error } = await teamUser();
  if (error) return error;
  const { chatId } = await ctx.params;
  if (!(await chatExists(chatId))) return new Response("Not found", { status: 404 });

  const query = new URL(request.url).searchParams;
  const before = query.get("before");
  if (before) return Response.json(await messagesBefore(chatId, before));

  // A Basecamp hiccup shouldn't break the poll; the stored lines still show.
  try {
    await refreshChatIfStale(chatId);
  } catch (refreshError) {
    console.error("[chat] refresh failed", refreshError instanceof Error ? refreshError.message : refreshError);
  }
  const after = query.get("after");
  return Response.json({ messages: after ? await messagesAfter(chatId, after) : [] });
}

const sendSchema = z.object({ text: z.string().trim().min(1, "Type a message").max(5000, "That message is too long") });

export async function POST(request: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const { user, error } = await teamUser();
  if (error) return error;
  const { chatId } = await ctx.params;
  if (!(await chatExists(chatId))) return new Response("Not found", { status: 404 });

  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid message" }, { status: 400 });
  try {
    const row = await sendChatLine(user.id, chatId, parsed.data.text);
    const [message] = await toMessages([row]);
    return Response.json({ message });
  } catch (sendError) {
    const notConnected = sendError instanceof BasecampNotConnectedError;
    return Response.json(
      { error: sendError instanceof Error ? sendError.message : "Couldn't send", notConnected },
      { status: notConnected ? 409 : 502 },
    );
  }
}
