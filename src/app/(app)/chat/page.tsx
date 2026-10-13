import { requirePageRole } from "@/lib/rbac";
import { stringParam } from "@/lib/table-params";
import { ChatFrame } from "./chat-frame";
import { ChatList } from "./chat-list";

// Chat: Basecamp project chats laid out like WhatsApp. This route is the
// list; a chat opens at /chat/[chatId].

export const metadata = { title: "Chat" };

export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  await requirePageRole("HR_ADMIN", "MANAGER");
  const q = stringParam((await searchParams).q);
  return (
    <ChatFrame list={<ChatList q={q} />} showConversationOnPhone={false}>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-muted/30 p-8 text-center">
        <p className="text-lg font-medium">Basecamp chats</p>
        <p className="max-w-sm text-sm text-zinc-500">
          Pick a project chat on the left. New messages appear within a few seconds; replies post to Basecamp under
          your own name.
        </p>
      </div>
    </ChatFrame>
  );
}
