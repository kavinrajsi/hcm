"use client";

import { useSyncExternalStore } from "react";

// "Install app" support for the phone Account sheet. Chrome-family browsers
// fire `beforeinstallprompt` once, early in page load — often before the
// sheet has ever mounted — so the listener lives at module level and keeps
// the event until the user taps Install. iOS Safari has no prompt API; the
// UI shows Add to Home Screen steps instead.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState = {
  installed: boolean;
  canPrompt: boolean;
  platform: "ios" | "other";
};

let deferred: BeforeInstallPromptEvent | null = null;
let installedSeen = false;
let snapshot: InstallState | null = null;
const listeners = new Set<() => void>();

// Nothing renders on the server, so the row appears only after hydration.
const SERVER_STATE: InstallState = {
  installed: true,
  canPrompt: false,
  platform: "other",
};

function notify() {
  snapshot = null;
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep the mini-infobar away; we prompt on tap
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedSeen = true;
    notify();
  });
}

function getSnapshot(): InstallState {
  // Cached: useSyncExternalStore needs a stable object between changes.
  snapshot ??= {
    installed:
      installedSeen ||
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    canPrompt: deferred !== null,
    platform:
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
        ? "ios"
        : "other",
  };
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows the browser's install dialog; the event is single-use. */
export async function promptInstall(): Promise<void> {
  const e = deferred;
  if (!e) return;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") installedSeen = true;
  notify();
}

export function useInstallPrompt(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}
