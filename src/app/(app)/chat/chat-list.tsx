"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { chatAvatarColor, chatListTime } from "@/lib/chat/format";
import { FilterSearch } from "@/components/data-table/filter-bar";
import { cn } from "@/lib/utils";

// Chat page: the left-hand list of Basecamp project chats, WhatsApp-style —
// most recent first, last message with its sender, and a green badge for
// messages the viewer hasn't seen. It lives in the Chat layout, so opening
// another chat only swaps the conversation on the right: the list keeps its
// scroll position and search. The open chat comes from the URL.

export type ChatListItem = {
  basecampId: string;
  projectId: string;
  projectName: string;
  title: string;
  lastLineAt: string | null; // ISO
  lastLinePreview: string | null;
};

const REFRESH_MS = 30_000;

export function ChatList({ chats, unread }: { chats: ChatListItem[]; unread: Record<string, number> }) {
  const router = useRouter();
  const activeId = useSelectedLayoutSegment();
  const query = useSearchParams().get("q")?.trim().toLowerCase() ?? "";
  const scroller = useRef<HTMLUListElement>(null);

  // Badges and last messages stay current: every 30 s while visible, and
  // shortly after switching chats (the one just left is now read). Reads
  // HCM's own copy only; Basecamp is checked by the cron and the open chat.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);
  useEffect(() => {
    const soon = setTimeout(() => router.refresh(), 1_500);
    return () => clearTimeout(soon);
  }, [activeId, router]);

  // Keep the open chat in view when arriving from a link.
  useEffect(() => {
    scroller.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
    // Only on first render; after that the reader controls the scroll.
  }, []);

  const shown = query
    ? chats.filter(
        (chat) => chat.projectName.toLowerCase().includes(query) || chat.title.toLowerCase().includes(query),
      )
    : chats;
  const now = new Date();
  const search = query ? `?q=${encodeURIComponent(query)}` : "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-semibold">Chats</h1>
        <div className="mt-3">
          <FilterSearch
            placeholder="Search"
            inputClassName="rounded-full border-transparent bg-muted dark:border-transparent"
          />
        </div>
      </div>
      <ul ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-zinc-500">
            {query ? "No chats match." : "No chats loaded from Basecamp yet."}
          </li>
        )}
        {shown.map((chat) => {
          const active = chat.basecampId === activeId;
          // The open chat counts as read.
          const count = active ? 0 : (unread[chat.basecampId] ?? 0);
          return (
            <li key={chat.basecampId} className="px-2">
              <Link
                href={`/chat/${chat.basecampId}${search}`}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[72px] items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/70",
                  active && "bg-muted",
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
                      suppressHydrationWarning
                      className={cn(
                        "shrink-0 text-xs",
                        count > 0 ? "font-medium text-[var(--chat-unread)]" : "text-zinc-500",
                      )}
                    >
                      {chatListTime(chat.lastLineAt ? new Date(chat.lastLineAt) : null, now)}
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
