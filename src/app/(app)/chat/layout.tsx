import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { unreadCounts } from "@/lib/chat/reads";
import { myBasecampPersonId } from "@/lib/chat/viewer";
import { ChatFrame } from "./chat-frame";
import { ChatList } from "./chat-list";

// Chat: the frame and the chat list, shared by /chat and /chat/[chatId], so
// switching chats only re-renders the conversation on the right.

export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const myPersonId = await myBasecampPersonId(user);
  const [chats, unread] = await Promise.all([
    db.basecampChat.findMany({
      orderBy: [{ lastLineAt: { sort: "desc", nulls: "last" } }, { projectName: "asc" }],
      select: { basecampId: true, projectId: true, projectName: true, title: true, lastLineAt: true, lastLinePreview: true },
    }),
    unreadCounts(user.id, myPersonId),
  ]);
  return (
    <ChatFrame
      list={
        <ChatList
          chats={chats.map((chat) => ({ ...chat, lastLineAt: chat.lastLineAt?.toISOString() ?? null }))}
          unread={Object.fromEntries(unread)}
        />
      }
    >
      {children}
    </ChatFrame>
  );
}
