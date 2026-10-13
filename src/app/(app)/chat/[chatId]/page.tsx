import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { stringParam } from "@/lib/table-params";
import { latestMessages } from "@/lib/chat/messages";
import { markChatRead } from "@/lib/chat/reads";
import { myBasecampPersonId } from "@/lib/chat/viewer";
import { chatAvatarColor } from "@/lib/chat/format";
import { ArrowOutwardIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { ChatView } from "./chat-view";

// Chat: one Basecamp project chat — the right-hand pane only (the list comes
// from the Chat layout, so switching chats leaves it in place). The server
// renders the newest messages and marks the chat read; ChatView then polls
// for new ones and sends.

export const metadata = { title: "Chat" };

const PEOPLE_WINDOW_MS = 90 * 86_400_000;

/** Start of the window for the header's "who's here" line (last 3 months). */
function peopleWindowStart() {
  return new Date(Date.now() - PEOPLE_WINDOW_MS);
}

export default async function ChatThreadPage({ params, searchParams }: PageProps<"/chat/[chatId]">) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const { chatId } = await params;
  const q = stringParam((await searchParams).q);
  const chat = await db.basecampChat.findUnique({
    where: { basecampId: chatId },
    select: { basecampId: true, projectId: true, projectName: true, title: true, appUrl: true },
  });
  if (!chat) notFound();

  const [{ messages, hasEarlier }, myPersonId, connection, posters] = await Promise.all([
    latestMessages(chat.basecampId),
    myBasecampPersonId(user),
    db.basecampToken.findUnique({ where: { userId: user.id }, select: { userId: true } }),
    db.basecampChatLine.groupBy({
      by: ["creatorPersonId", "creatorName"],
      where: { chatBasecampId: chat.basecampId, createdAt: { gte: peopleWindowStart() } },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
    }),
    markChatRead(user.id, chat.basecampId),
  ]);
  // Like WhatsApp's member line: who has posted lately, most recent first.
  const names = [...new Set(posters.map((poster) => poster.creatorName))];
  const subtitle = names.length > 0 ? names.join(", ") : chat.title !== "Chat" ? chat.title : "Basecamp project chat";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b bg-[var(--chat-pill)] px-3 py-2 md:px-4">
          <Link
            href={`/chat${q ? `?q=${encodeURIComponent(q)}` : ""}`}
            aria-label="Back to chats"
            className="-ml-1 flex size-10 items-center justify-center rounded-full hover:bg-muted md:hidden"
          >
            <ChevronRightIcon className="size-6 rotate-180" />
          </Link>
          <span
            aria-hidden="true"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full font-semibold text-white",
              chatAvatarColor(chat.projectId),
            )}
          >
            {chat.projectName.trim().charAt(0).toUpperCase() || "#"}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{chat.projectName}</h2>
            <p className="truncate text-xs text-[var(--chat-meta)]">{subtitle}</p>
          </div>
          <a
            href={chat.appUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in Basecamp"
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-sm text-[var(--chat-meta)] hover:bg-muted hover:text-foreground"
          >
            <span className="hidden sm:inline">Basecamp</span>
            <ArrowOutwardIcon className="size-4" />
          </a>
        </header>
        <ChatView
          key={chat.basecampId}
          chatId={chat.basecampId}
          initialMessages={messages}
          initialHasEarlier={hasEarlier}
          myPersonId={myPersonId}
          connected={Boolean(connection)}
        />
    </div>
  );
}
