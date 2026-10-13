import Link from "next/link";
import { db } from "@/lib/db";
import { chatAvatarColor, chatListTime } from "@/lib/chat/format";
import { unreadCounts } from "@/lib/chat/reads";
import { FilterSearch } from "@/components/data-table/filter-bar";
import { cn } from "@/lib/utils";
import { ChatListRefresher } from "./list-refresher";

// Chat page: the left-hand list of Basecamp project chats, WhatsApp-style —
// most recent first, last message with its sender, and a green badge for
// messages the viewer hasn't seen.

export async function ChatList({
  activeId,
  q,
  userId,
  myPersonId,
}: {
  activeId?: string;
  q?: string;
  userId: string;
  myPersonId: string | null;
}) {
  const [chats, unread] = await Promise.all([
    db.basecampChat.findMany({
      where: q
        ? {
            OR: [
              { projectName: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ lastLineAt: { sort: "desc", nulls: "last" } }, { projectName: "asc" }],
      select: { basecampId: true, projectId: true, projectName: true, title: true, lastLineAt: true, lastLinePreview: true },
    }),
    unreadCounts(userId, myPersonId),
  ]);
  const now = new Date();
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ChatListRefresher />
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-semibold">Chats</h1>
        <div className="mt-3">
          <FilterSearch
            placeholder="Search"
            inputClassName="rounded-full border-transparent bg-muted dark:border-transparent"
          />
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {chats.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-zinc-500">
            {q ? "No chats match." : "No chats loaded from Basecamp yet."}
          </li>
        )}
        {chats.map((chat) => {
          // The open chat counts as read.
          const count = chat.basecampId === activeId ? 0 : (unread.get(chat.basecampId) ?? 0);
          return (
            <li key={chat.basecampId} className="px-2">
              <Link
                href={`/chat/${chat.basecampId}${q ? `?q=${encodeURIComponent(q)}` : ""}`}
                aria-current={chat.basecampId === activeId ? "page" : undefined}
                className={cn(
                  "flex min-h-[72px] items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/70",
                  chat.basecampId === activeId && "bg-muted",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white",
                    chatAvatarColor(chat.projectId),
                  )}
                >
                  {chat.projectName.trim().charAt(0).toUpperCase() || "#"}
                </span>
                <span className="min-w-0 flex-1 border-b border-border/60 pb-2">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold">{chat.projectName}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        count > 0 ? "font-medium text-[var(--chat-unread)]" : "text-zinc-500",
                      )}
                    >
                      {chatListTime(chat.lastLineAt, now)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">
                      {chat.lastLinePreview || (chat.title !== "Chat" ? chat.title : "No messages yet")}
                    </span>
                    {count > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--chat-unread)] px-1.5 text-[11px] font-semibold text-black">
                        <span className="sr-only">Unread messages: </span>
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
