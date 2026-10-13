"use client";

// Chat: the ☺ button's emoji panel. Opens above the message box (full width
// on phones), six tabs plus a Recent row; picking one hands it to the
// composer, which inserts it at the cursor. Escape or a click outside closes it.

import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { EMOJI_GROUPS, recentEmoji, rememberEmoji } from "@/lib/chat/emoji";
import { cn } from "@/lib/utils";

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string>(EMOJI_GROUPS[0].key);
  const [recent, setRecent] = useState<string[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const group = EMOJI_GROUPS.find((item) => item.key === tab) ?? EMOJI_GROUPS[0];
  const pick = (emoji: string) => {
    setRecent(rememberEmoji(emoji));
    onPick(emoji);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Emoji"
        aria-expanded={open}
        onClick={() => {
          if (!open) setRecent(recentEmoji());
          setOpen((value) => !value);
        }}
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--chat-meta)] hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
      >
        <Smile className="size-6" />
      </button>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Emoji"
          className="absolute bottom-full left-0 z-40 mb-2 w-full rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg md:left-auto md:right-0 md:w-80"
        >
          <div role="tablist" className="flex gap-1 border-b pb-2">
            {EMOJI_GROUPS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={item.key === tab}
                aria-label={item.label}
                title={item.label}
                onClick={() => setTab(item.key)}
                className={cn(
                  "flex size-9 flex-1 items-center justify-center rounded-md text-lg",
                  item.key === tab ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                {item.icon}
              </button>
            ))}
          </div>
          <div className="max-h-60 overflow-y-auto pt-2">
            {recent.length > 0 && (
              <>
                <p className="px-1 pb-1 text-xs text-zinc-500">Recent</p>
                <EmojiGrid emoji={recent} onPick={pick} />
                <p className="px-1 pt-2 pb-1 text-xs text-zinc-500">{group.label}</p>
              </>
            )}
            <EmojiGrid emoji={group.emoji} onPick={pick} />
          </div>
        </div>
      )}
    </>
  );
}

function EmojiGrid({ emoji, onPick }: { emoji: readonly string[]; onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emoji.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onPick(item)}
          className="flex aspect-square items-center justify-center rounded-md text-2xl hover:bg-muted"
        >
          {item}
        </button>
      ))}
    </div>
  );
}
