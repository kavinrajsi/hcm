import Link from "next/link";
import { db } from "@/lib/db";
import { chatListTime } from "@/lib/chat/format";
import { FilterSearch } from "@/components/data-table/filter-bar";
import { cn } from "@/lib/utils";

// Chat page: the left-hand list of Basecamp project chats, most recent
// message first (WhatsApp's chat list).

export async function ChatList({ activeId, q }: { activeId?: string; q?: string }) {
  const chats = await db.basecampChat.findMany({
    where: q
      ? {
          OR: [
            { projectName: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ lastLineAt: { sort: "desc", nulls: "last" } }, { projectName: "asc" }],
    select: { basecampId: true, projectName: true, title: true, lastLineAt: true, lastLinePreview: true },
  });
  const now = new Date();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-3">
        <FilterSearch placeholder="Search project or chat" />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {chats.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-zinc-500">
            {q ? "No chats match." : "No chats loaded from Basecamp yet."}
          </li>
        )}
        {chats.map((chat) => (
          <li key={chat.basecampId}>
            <Link
              href={`/chat/${chat.basecampId}${q ? `?q=${encodeURIComponent(q)}` : ""}`}
              aria-current={chat.basecampId === activeId ? "page" : undefined}
              className={cn(
                "flex min-h-16 items-start gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/60",
                chat.basecampId === activeId && "bg-muted",
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-sm font-semibold text-emerald-700 dark:text-emerald-400"
              >
                {chat.projectName.trim().charAt(0).toUpperCase() || "#"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{chat.projectName}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{chatListTime(chat.lastLineAt, now)}</span>
                </span>
                <span className="block truncate text-sm text-zinc-500">
                  {chat.lastLinePreview || (chat.title !== "Chat" ? chat.title : "No messages yet")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
