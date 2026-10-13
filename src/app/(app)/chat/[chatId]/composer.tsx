"use client";

// Chat: the message box, WhatsApp-style, always pinned under the messages.
// "+" picks a file (up to 4 MB), ☺ opens the emoji panel, Enter sends
// (Shift+Enter for a new line). A file goes first, then the text, as two
// Basecamp lines like Basecamp's own box. Both post under the sender's own
// Basecamp connection; without one, Send offers to connect (the typed text
// is kept for this tab and comes back afterwards).

import { useRef, useState, useSyncExternalStore } from "react";
import { LoaderCircle, Paperclip, Plus, SendHorizontal, X } from "lucide-react";
import type { ChatMessage } from "@/lib/chat/messages";
import { clearDraft, loadDraft, saveDraft } from "@/lib/chat/draft";
import { EmojiPicker } from "./emoji-picker";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

// The draft is only read on render; nothing outside this box changes it.
const noSubscription = () => () => {};

type SendResult = { message?: ChatMessage; error?: string; notConnected?: boolean };

export function Composer({
  chatId,
  connected,
  onSent,
}: {
  chatId: string;
  connected: boolean;
  onSent: (message: ChatMessage) => void;
}) {
  // This chat's unsent text from earlier in the tab (after switching chats or
  // connecting Basecamp): empty on the server, the saved draft in the browser.
  const savedDraft = useSyncExternalStore(
    noSubscription,
    () => loadDraft(chatId),
    () => "",
  );
  // null until the person types, so the saved draft shows until then.
  const [typed, setTyped] = useState<string | null>(null);
  const text = typed ?? savedDraft;
  // Shown instead of posting when the sender has no Basecamp connection.
  const [needsConnect, setNeedsConnect] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  function changeText(next: string) {
    setTyped(next);
    saveDraft(chatId, next);
  }

  function insertEmoji(emoji: string) {
    const element = box.current;
    if (!element) return changeText(text + emoji);
    const start = element.selectionStart ?? text.length;
    const end = element.selectionEnd ?? text.length;
    changeText(text.slice(0, start) + emoji + text.slice(end));
    // Put the cursor after the emoji once React has updated the box.
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function post(request: Promise<Response>): Promise<boolean> {
    const response = await request;
    const body = (await response.json().catch(() => ({}))) as SendResult;
    if (!response.ok || !body.message) {
      if (body.notConnected) setNeedsConnect(true);
      else setError(body.error ?? "Couldn't send. Try again.");
      return false;
    }
    onSent(body.message);
    return true;
  }

  async function send() {
    const message = text.trim();
    if ((!message && !file) || sending) return;
    if (!connected) {
      setNeedsConnect(true);
      return;
    }
    setSending(true);
    setError(null);
    try {
      if (file) {
        const form = new FormData();
        form.set("file", file);
        if (!(await post(fetch(`/api/chat/${chatId}/uploads`, { method: "POST", body: form })))) return;
        setFile(null);
      }
      if (message) {
        const sent = await post(
          fetch(`/api/chat/${chatId}/lines`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: message }),
          }),
        );
        if (sent) {
          setTyped("");
          clearDraft(chatId);
        }
      }
    } catch {
      setError("Couldn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const canSend = Boolean(text.trim() || file) && !sending;
  return (
    <div className="shrink-0 bg-[var(--chat-pill)] px-2 py-2 md:px-4">
      {needsConnect && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-[var(--chat-composer)] px-3 py-2 text-sm">
          <p className="min-w-0 flex-1">
            Connect your Basecamp to send messages under your name.
            {file && <span className="text-[var(--chat-meta)]"> Pick the file again after connecting.</span>}
          </p>
          <a
            href={`/api/basecamp/connect?returnTo=${encodeURIComponent(`/chat/${chatId}`)}`}
            onClick={() => saveDraft(chatId, text)}
            className="inline-flex h-9 items-center rounded-full bg-[var(--chat-accent)] px-4 font-medium text-white"
          >
            Connect
          </a>
          <button
            type="button"
            aria-label="Not now"
            onClick={() => setNeedsConnect(false)}
            className="flex size-8 items-center justify-center rounded-full text-[var(--chat-meta)] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {error && <p className="mb-2 px-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {file && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--chat-composer)] px-3 py-2 text-sm">
          <Paperclip className="size-4 shrink-0 text-[var(--chat-meta)]" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <button
            type="button"
            aria-label="Remove file"
            onClick={() => setFile(null)}
            className="flex size-8 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      <form
        className="relative flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          ref={picker}
          type="file"
          className="hidden"
          onChange={(event) => {
            const chosen = event.target.files?.[0] ?? null;
            event.target.value = "";
            if (chosen && chosen.size > MAX_FILE_BYTES) {
              setError("Files over 4 MB: send them in Basecamp.");
              return;
            }
            setError(null);
            setFile(chosen);
          }}
        />
        <button
          type="button"
          aria-label="Attach a file"
          onClick={() => picker.current?.click()}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--chat-meta)] hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
        >
          <Plus className="size-6" />
        </button>
        <div className="flex min-h-11 flex-1 items-end rounded-3xl bg-[var(--chat-composer)] pl-4 pr-1">
          <textarea
            ref={box}
            value={text}
            onChange={(event) => changeText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={5000}
            placeholder="Type a message"
            aria-label="Message"
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base outline-none field-sizing-content placeholder:text-[var(--chat-meta)] md:text-sm"
          />
          <EmojiPicker onPick={insertEmoji} />
        </div>
        <button
          type="submit"
          aria-label="Send"
          disabled={!canSend}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent)] text-white transition-opacity disabled:opacity-50"
        >
          {sending ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
        </button>
      </form>
    </div>
  );
}
