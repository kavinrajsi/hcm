"use client";

// Chat: one conversation, WhatsApp-style. Polls /api/chat/[id]/lines every
// few seconds while the tab is visible (Basecamp has no chat webhooks; the
// route shares one Basecamp check between everyone viewing the chat), loads
// older messages on request, and sends replies as the signed-in person.
// Message HTML was sanitized on the server before it was stored.

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileText, LoaderCircle, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { chatDayLabel, chatTime } from "@/lib/chat/format";
import { istDayKey } from "@/lib/format-date";
import type { ChatMessage } from "@/lib/chat/messages";
import { cn } from "@/lib/utils";

const POLL_MS = 5_000;

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(current.map((message) => message.id));
  const added = incoming.filter((message) => !seen.has(message.id));
  if (added.length === 0) return current;
  return [...current, ...added].sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatView({
  chatId,
  initialMessages,
  initialHasEarlier,
  myPersonId,
  connected: initiallyConnected,
}: {
  chatId: string;
  initialMessages: ChatMessage[];
  initialHasEarlier: boolean;
  myPersonId: string | null;
  connected: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasEarlier, setHasEarlier] = useState(initialHasEarlier);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [connected, setConnected] = useState(initiallyConnected);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Scroll handling: stick to the bottom for new messages only when the
  // reader is already there; keep the position when older ones load.
  const stickToBottom = useRef(true);
  const keepOffset = useRef<number | null>(null);
  // The newest message's time, for "?after=" on the next poll.
  const latest = useRef(initialMessages.at(-1)?.createdAt ?? new Date(0).toISOString());

  useLayoutEffect(() => {
    latest.current = messages.at(-1)?.createdAt ?? latest.current;
    const element = scroller.current;
    if (!element) return;
    if (keepOffset.current !== null) {
      element.scrollTop = element.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    } else if (stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  const poll = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/chat/${chatId}/lines?after=${encodeURIComponent(latest.current)}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const body = (await response.json()) as { messages: ChatMessage[] };
      if (body.messages.length) setMessages((current) => mergeMessages(current, body.messages));
    } catch {
      // Offline for a moment: the next poll catches up.
    }
  }, [chatId]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer || document.visibilityState !== "visible") return;
      void poll();
      timer = setInterval(() => void poll(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [poll]);

  async function loadEarlier() {
    const first = messages[0];
    if (!first || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const response = await fetch(`/api/chat/${chatId}/lines?before=${encodeURIComponent(first.createdAt)}`);
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { messages: ChatMessage[]; hasEarlier: boolean };
      keepOffset.current = scroller.current ? scroller.current.scrollHeight - scroller.current.scrollTop : null;
      setMessages((current) => mergeMessages(current, body.messages));
      setHasEarlier(body.hasEarlier);
    } catch {
      setError("Couldn't load earlier messages.");
    } finally {
      setLoadingEarlier(false);
    }
  }

  async function send() {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/chat/${chatId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: ChatMessage;
        error?: string;
        notConnected?: boolean;
      };
      if (!response.ok || !body.message) {
        if (body.notConnected) setConnected(false);
        setError(body.error ?? "Couldn't send. Try again.");
        return;
      }
      stickToBottom.current = true;
      setMessages((current) => mergeMessages(current, [body.message!]));
      setText("");
    } catch {
      setError("Couldn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const now = new Date();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-3 py-4 md:px-6"
      >
        {hasEarlier && (
          <div className="mb-4 flex justify-center">
            <Button type="button" variant="outline" size="sm" onClick={loadEarlier} disabled={loadingEarlier}>
              {loadingEarlier && <LoaderCircle className="size-4 animate-spin" />}
              Load earlier messages
            </Button>
          </div>
        )}
        {messages.length === 0 && (
          <p className="py-16 text-center text-sm text-zinc-500">No messages in this chat yet.</p>
        )}
        <ol className="flex flex-col gap-1">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const created = new Date(message.createdAt);
            const newDay = !previous || istDayKey(new Date(previous.createdAt)) !== istDayKey(created);
            // Consecutive messages from one person within 5 minutes share a header.
            const continued =
              !newDay &&
              previous?.personId === message.personId &&
              created.getTime() - new Date(previous.createdAt).getTime() < 5 * 60_000;
            const mine = myPersonId !== null && message.personId === myPersonId;
            return (
              <Fragment key={message.id}>
                {newDay && (
                  <li className="my-3 flex justify-center" aria-hidden="false">
                    <span className="rounded-full bg-background px-3 py-1 text-xs font-medium text-zinc-500 shadow-sm">
                      {chatDayLabel(created, now)}
                    </span>
                  </li>
                )}
                <li className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start", !continued && "mt-2")}>
                  {!mine && (
                    <span className="w-8 shrink-0">
                      {!continued && <EmployeeAvatar name={message.name} avatarKey={message.avatarKey} />}
                    </span>
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm md:max-w-[70%]",
                      mine
                        ? "rounded-br-sm bg-emerald-100 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-50"
                        : "rounded-bl-sm bg-background",
                    )}
                  >
                    {!mine && !continued && (
                      <p className="mb-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {message.name}
                      </p>
                    )}
                    {message.html && (
                      <div
                        className="break-words [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_figcaption]:hidden [&_figure]:my-1 [&_img]:max-h-72 [&_img]:max-w-full [&_img]:rounded-lg [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                        dangerouslySetInnerHTML={{ __html: message.html }}
                      />
                    )}
                    {message.attachments.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-1">
                        {message.attachments.map((file, fileIndex) => (
                          <li key={fileIndex}>
                            <a
                              href={file.url ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 rounded-lg border bg-background/60 px-2 py-1.5 hover:bg-background"
                            >
                              <FileText className="size-4 shrink-0 text-zinc-500" />
                              <span className="min-w-0 flex-1 truncate">{file.name}</span>
                              <span className="shrink-0 text-xs text-zinc-500">{formatSize(file.size)}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-0.5 text-right text-[11px] text-zinc-500 tabular-nums">{chatTime(created)}</p>
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </div>

      <div className="border-t bg-background p-2 md:p-3">
        {error && <p className="mb-2 px-1 text-sm text-red-600">{error}</p>}
        {connected ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter adds a line (as in WhatsApp Web).
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={5000}
              placeholder="Type a message"
              aria-label="Message"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-input bg-transparent px-4 py-2.5 text-base outline-none field-sizing-content focus-visible:ring-2 focus-visible:ring-ring md:text-sm dark:bg-input/30"
            />
            <Button
              type="submit"
              size="icon"
              className="size-11 shrink-0 rounded-full"
              disabled={sending || !text.trim()}
              aria-label="Send"
            >
              {sending ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
            </Button>
          </form>
        ) : (
          <p className="px-1 py-2 text-sm text-zinc-500">
            <a
              href={`/api/basecamp/connect?returnTo=${encodeURIComponent(`/chat/${chatId}`)}`}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Connect your Basecamp
            </a>{" "}
            to reply here. Messages post under your own name.
          </p>
        )}
      </div>
    </div>
  );
}
