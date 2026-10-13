"use client";

// Chat: one message bubble, WhatsApp-style. Own messages sit right in green,
// others left in grey with their photo and a per-person name colour; the
// first bubble of a run gets a tail. Long messages fold behind "Read more".
// The HTML was sanitized on the server before it was stored.

import { useLayoutEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { chatTime, senderColor } from "@/lib/chat/format";
import type { ChatMessage } from "@/lib/chat/messages";
import { cn } from "@/lib/utils";

// About 18 lines of text before "Read more".
const FOLD_HEIGHT_PX = 400;

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageBubble({
  message,
  mine,
  firstInRun,
}: {
  message: ChatMessage;
  mine: boolean;
  firstInRun: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [foldable, setFoldable] = useState(false);

  useLayoutEffect(() => {
    if (body.current) setFoldable(body.current.scrollHeight > FOLD_HEIGHT_PX + 40);
  }, [message.html]);

  const created = new Date(message.createdAt);
  return (
    <li className={cn("flex items-start gap-2", mine ? "justify-end" : "justify-start", firstInRun ? "mt-2" : "mt-0.5")}>
      {!mine && (
        <span className="w-8 shrink-0">
          {firstInRun && <EmployeeAvatar name={message.name} avatarKey={message.avatarKey} />}
        </span>
      )}
      <div
        className={cn(
          "relative max-w-[85%] rounded-lg px-2.5 pt-1.5 pb-1 text-sm text-[var(--chat-bubble-text)] shadow-sm md:max-w-[65%]",
          mine ? "bg-[var(--chat-bubble-own)]" : "bg-[var(--chat-bubble-other)]",
          firstInRun && (mine ? "rounded-tr-none" : "rounded-tl-none"),
        )}
      >
        {firstInRun && (
          // The tail: a small triangle in the bubble's colour at the top corner.
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-0 size-2.5",
              mine
                ? "-right-2 bg-[var(--chat-bubble-own)] [clip-path:polygon(0_0,100%_0,0_100%)]"
                : "-left-2 bg-[var(--chat-bubble-other)] [clip-path:polygon(0_0,100%_0,100%_100%)]",
            )}
          />
        )}
        {!mine && firstInRun && (
          <p className={cn("mb-0.5 text-[13px] font-semibold", senderColor(message.personId, message.name))}>
            {message.name}
          </p>
        )}
        {message.html && (
          <div
            ref={body}
            style={foldable && !expanded ? { maxHeight: FOLD_HEIGHT_PX } : undefined}
            className={cn(
              "break-words leading-relaxed [&_a]:text-sky-700 [&_a]:underline [&_a]:underline-offset-2 dark:[&_a]:text-sky-400",
              "[&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_figcaption]:hidden [&_figure]:my-1",
              "[&_img]:max-h-72 [&_img]:max-w-full [&_img]:rounded-md [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
              foldable && !expanded && "overflow-hidden",
            )}
            dangerouslySetInnerHTML={{ __html: message.html }}
          />
        )}
        {message.attachments.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {message.attachments.map((file, index) => (
              <li key={index}>
                <a
                  href={file.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-48 items-center gap-2 rounded-md bg-black/5 px-2 py-2 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  <FileText className="size-6 shrink-0 text-[var(--chat-meta)]" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-[var(--chat-meta)]">{formatSize(file.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end justify-between gap-3">
          {foldable && !expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="py-0.5 text-sm font-medium text-[var(--chat-accent)] hover:underline"
            >
              Read more
            </button>
          ) : (
            <span />
          )}
          <time
            dateTime={message.createdAt}
            className="ml-auto shrink-0 pl-2 text-[11px] text-[var(--chat-meta)] tabular-nums"
          >
            {chatTime(created)}
          </time>
        </div>
      </div>
    </li>
  );
}
