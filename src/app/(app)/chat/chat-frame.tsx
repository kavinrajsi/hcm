import { cn } from "@/lib/utils";

// Chat page: the full-height, two-pane frame (list | conversation). On
// phones only one pane shows: the list on /chat, the conversation on
// /chat/[id]. Height leaves room for the header and the phone tab bar, and
// nothing scrolls the page itself: only the chat list and the messages
// scroll, so the message box stays on the bottom edge.

export function ChatFrame({
  list,
  children,
  showConversationOnPhone,
}: {
  list: React.ReactNode;
  children: React.ReactNode;
  showConversationOnPhone: boolean;
}) {
  return (
    <main className="flex h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] min-h-0 w-full min-w-0 flex-1 overflow-hidden md:h-[calc(100dvh-4rem)]">
      <aside
        className={cn(
          "min-h-0 w-full border-r md:block md:w-80 lg:w-96",
          showConversationOnPhone ? "hidden" : "block",
        )}
      >
        {list}
      </aside>
      <section className={cn("min-h-0 min-w-0 flex-1 md:flex", showConversationOnPhone ? "flex" : "hidden")}>
        {children}
      </section>
    </main>
  );
}
