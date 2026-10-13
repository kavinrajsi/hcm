import { requirePageRole } from "@/lib/rbac";
import { stringParam } from "@/lib/table-params";
import { myBasecampPersonId } from "@/lib/chat/viewer";
import { ChatFrame } from "./chat-frame";
import { ChatList } from "./chat-list";

// Chat: Basecamp project chats laid out like WhatsApp. This route is the
// list; a chat opens at /chat/[chatId].

export const metadata = { title: "Chat" };

export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const q = stringParam((await searchParams).q);
  const myPersonId = await myBasecampPersonId(user);
  return (
    <ChatFrame list={<ChatList q={q} userId={user.id} myPersonId={myPersonId} />} showConversationOnPhone={false}>
      <div
        style={{ backgroundImage: "var(--chat-wallpaper)" }}
        className="flex flex-1 flex-col items-center justify-center gap-2 bg-[var(--chat-wallpaper-bg)] bg-repeat p-8 text-center"
      >
        <div className="rounded-2xl bg-[var(--chat-pill)] px-6 py-5 shadow-sm">
          <p className="text-lg font-medium">Basecamp chats</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--chat-meta)]">
            Pick a project chat. New messages appear within a few seconds; replies and files post to Basecamp under
            your own name.
          </p>
        </div>
      </div>
    </ChatFrame>
  );
}
