import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { myEmployeeId } from "@/lib/my-employee";
import { stringParam } from "@/lib/table-params";
import { latestMessages } from "@/lib/chat/messages";
import { ChevronRightIcon, ArrowOutwardIcon } from "@/components/icons";
import { ChatFrame } from "../chat-frame";
import { ChatList } from "../chat-list";
import { ChatView } from "./chat-view";

// Chat: one Basecamp project chat. The server renders the newest messages;
// ChatView then polls for new ones and sends replies.

export const metadata = { title: "Chat" };

export default async function ChatThreadPage({ params, searchParams }: PageProps<"/chat/[chatId]">) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const { chatId } = await params;
  const q = stringParam((await searchParams).q);
  const chat = await db.basecampChat.findUnique({
    where: { basecampId: chatId },
    select: { basecampId: true, projectName: true, title: true, appUrl: true },
  });
  if (!chat) notFound();

  const [{ messages, hasEarlier }, employeeId, connection] = await Promise.all([
    latestMessages(chat.basecampId),
    myEmployeeId(user),
    db.basecampToken.findUnique({ where: { userId: user.id }, select: { id: true } }),
  ]);
  const me = employeeId
    ? await db.employee.findUnique({ where: { id: employeeId }, select: { basecampPersonId: true } })
    : null;

  return (
    <ChatFrame list={<ChatList activeId={chat.basecampId} q={q} />} showConversationOnPhone>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-3 py-2.5 md:px-4">
          <Link
            href={`/chat${q ? `?q=${encodeURIComponent(q)}` : ""}`}
            aria-label="Back to chats"
            className="-ml-1 flex size-10 items-center justify-center rounded-full hover:bg-muted md:hidden"
          >
            <ChevronRightIcon className="size-6 rotate-180" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">{chat.projectName}</h1>
            {chat.title !== "Chat" && <p className="truncate text-xs text-zinc-500">{chat.title}</p>}
          </div>
          <a
            href={chat.appUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-foreground"
          >
            Basecamp
            <ArrowOutwardIcon className="size-3.5" />
          </a>
        </header>
        <ChatView
          key={chat.basecampId}
          chatId={chat.basecampId}
          initialMessages={messages}
          initialHasEarlier={hasEarlier}
          myPersonId={me?.basecampPersonId ?? null}
          connected={Boolean(connection)}
        />
      </div>
    </ChatFrame>
  );
}
