import { currentUser } from "@/lib/rbac";
import { db } from "@/lib/db";
import { BasecampNotConnectedError, MAX_UPLOAD_BYTES, sendChatUpload } from "@/lib/chat/sync";
import { toMessages } from "@/lib/chat/messages";

export const maxDuration = 60;

// Chat page "+": sends one file (up to 4 MB) into the chat as the signed-in
// person, through their own Basecamp connection. HR and managers only.

export async function POST(request: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (user.role !== "HR_ADMIN" && user.role !== "MANAGER") return new Response("Forbidden", { status: 403 });
  const { chatId } = await ctx.params;
  if ((await db.basecampChat.count({ where: { basecampId: chatId } })) === 0)
    return new Response("Not found", { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES)
    return Response.json({ error: "Files over 4 MB: send them in Basecamp." }, { status: 413 });

  try {
    const row = await sendChatUpload(user.id, chatId, {
      name: file.name || "file",
      type: file.type,
      bytes: await file.arrayBuffer(),
    });
    const [message] = await toMessages([row]);
    return Response.json({ message });
  } catch (uploadError) {
    const notConnected = uploadError instanceof BasecampNotConnectedError;
    return Response.json(
      { error: uploadError instanceof Error ? uploadError.message : "Couldn't send the file", notConnected },
      { status: notConnected ? 409 : 502 },
    );
  }
}
