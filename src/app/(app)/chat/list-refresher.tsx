"use client";

// Chat page: re-renders the chat list every 30 seconds while the tab is
// visible, so unread badges and last messages stay current. It reads HCM's
// own copy only; Basecamp is checked by the cron and the open chat.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_MS = 30_000;

export function ChatListRefresher() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
