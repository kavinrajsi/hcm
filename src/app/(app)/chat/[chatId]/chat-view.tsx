"use client";

// Chat: one conversation, WhatsApp-style (patterned wallpaper, day pills,
// bubbles, rounded message box). Polls /api/chat/[id]/lines every few
// seconds while the tab is visible (Basecamp has no chat webhooks; the route
// shares one Basecamp check between everyone viewing the chat and marks the
// chat read), loads older messages on request, and sends as the signed-in
// person.

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { chatDayLabel } from "@/lib/chat/format";
import { istDayKey } from "@/lib/format-date";
import type { ChatMessage } from "@/lib/chat/messages";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";

const POLL_MS = 5_000;
// Messages from one person within this gap share a run (one name, one tail).
const RUN_GAP_MS = 5 * 60_000;

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(current.map((message) => message.id));
  const added = incoming.filter((message) => !seen.has(message.id));
  if (added.length === 0) return current;
  return [...current, ...added].sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
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
  const [earlierError, setEarlierError] = useState(false);
  const [connected, setConnected] = useState(initiallyConnected);
  const scroller = useRef<HTMLDivElement>(null);
  // Stick to the bottom for new messages only when the reader is already
  // there; keep the position when older ones load above.
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
      const response = await fetch(`/api/chat/${chatId}/lines?after=${encodeURIComponent(latest.current)}`, {
        cache: "no-store",
      });
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
    setEarlierError(false);
    try {
      const response = await fetch(`/api/chat/${chatId}/lines?before=${encodeURIComponent(first.createdAt)}`);
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { messages: ChatMessage[]; hasEarlier: boolean };
      keepOffset.current = scroller.current ? scroller.current.scrollHeight - scroller.current.scrollTop : null;
      setMessages((current) => mergeMessages(current, body.messages));
      setHasEarlier(body.hasEarlier);
    } catch {
      setEarlierError(true);
    } finally {
      setLoadingEarlier(false);
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
        style={{ backgroundImage: "var(--chat-wallpaper)" }}
        className="min-h-0 flex-1 overflow-y-auto bg-[var(--chat-wallpaper-bg)] bg-repeat px-3 py-4 md:px-[6%]"
      >
        {hasEarlier && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={loadEarlier}
              disabled={loadingEarlier}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--chat-pill)] px-4 py-1.5 text-xs font-medium text-[var(--chat-meta)] shadow-sm hover:text-foreground"
            >
              {loadingEarlier && <LoaderCircle className="size-3.5 animate-spin" />}
              {earlierError ? "Couldn't load — try again" : "Load earlier messages"}
            </button>
          </div>
        )}
        {messages.length === 0 && (
          <p className="mx-auto mt-16 w-fit rounded-lg bg-[var(--chat-pill)] px-4 py-2 text-center text-sm text-[var(--chat-meta)] shadow-sm">
            No messages in this chat yet.
          </p>
        )}
        <ol className="flex flex-col">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const created = new Date(message.createdAt);
            const newDay = !previous || istDayKey(new Date(previous.createdAt)) !== istDayKey(created);
            const firstInRun =
              newDay ||
              previous?.personId !== message.personId ||
              created.getTime() - new Date(previous.createdAt).getTime() >= RUN_GAP_MS;
            return (
              <Fragment key={message.id}>
                {newDay && (
                  <li className="sticky top-0 z-10 my-3 flex justify-center">
                    <span className="rounded-lg bg-[var(--chat-pill)] px-3 py-1 text-xs font-medium text-[var(--chat-meta)] shadow-sm">
                      {chatDayLabel(created, now)}
                    </span>
                  </li>
                )}
                <MessageBubble
                  message={message}
                  mine={myPersonId !== null && message.personId === myPersonId}
                  firstInRun={firstInRun}
                />
              </Fragment>
            );
          })}
        </ol>
      </div>

      {connected ? (
        <Composer
          chatId={chatId}
          onSent={(message) => {
            stickToBottom.current = true;
            setMessages((current) => mergeMessages(current, [message]));
          }}
          onNotConnected={() => setConnected(false)}
        />
      ) : (
        <p className="bg-[var(--chat-pill)] px-4 py-3 text-sm text-[var(--chat-meta)]">
          <a
            href={`/api/basecamp/connect?returnTo=${encodeURIComponent(`/chat/${chatId}`)}`}
            className="font-medium text-[var(--chat-accent)] underline underline-offset-4"
          >
            Connect your Basecamp
          </a>{" "}
          to reply here. Messages and files post under your own name.
        </p>
      )}
    </div>
  );
}
