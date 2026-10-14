"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Dashboard: fresh numbers every 5 minutes while the tab is visible (a
// hidden tab never refreshes, so it doesn't keep the sign-in alive), on
// coming back to a stale tab, and with the Refresh button.

const INTERVAL_MS = 5 * 60_000;

export function AutoRefresh({ renderedAt, paused }: { renderedAt: string; paused: boolean }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [now, setNow] = useState(() => Date.parse(renderedAt));

  useEffect(() => {
    if (paused) return;
    const last = Date.parse(renderedAt);
    const refreshIfStale = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= INTERVAL_MS) startRefresh(() => router.refresh());
    };
    const timer = setInterval(() => {
      setNow(Date.now());
      refreshIfStale();
    }, 30_000);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [renderedAt, paused, router]);

  const minutes = Math.max(0, Math.floor((now - Date.parse(renderedAt)) / 60_000));
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => startRefresh(() => router.refresh())}
      disabled={refreshing}
      title="Numbers refresh every 5 minutes"
    >
      <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
      {refreshing ? "Refreshing…" : minutes < 1 ? "Updated just now" : `Updated ${minutes} min ago`}
    </Button>
  );
}
