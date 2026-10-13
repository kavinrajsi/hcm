import { requirePageRole } from "@/lib/rbac";

// Chat: nothing open yet — the right-hand pane's welcome card (the chat list
// comes from the Chat layout; on phones the list shows instead).

export const metadata = { title: "Chat" };

export default async function ChatPage() {
  await requirePageRole("HR_ADMIN", "MANAGER");
  return (
    <div
      style={{ backgroundImage: "var(--chat-wallpaper)" }}
      className="flex flex-1 flex-col items-center justify-center gap-2 bg-[var(--chat-wallpaper-bg)] bg-repeat p-8 text-center"
    >
      <div className="rounded-2xl bg-[var(--chat-pill)] px-6 py-5 shadow-sm">
        <p className="text-lg font-medium">Basecamp chats</p>
        <p className="mt-1 max-w-sm text-sm text-[var(--chat-meta)]">
          Pick a project chat. New messages appear within a few seconds; replies and files post to Basecamp under your
          own name.
        </p>
      </div>
    </div>
  );
}
