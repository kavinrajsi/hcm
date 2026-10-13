"use client";

import { useLayoutEffect, useRef } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "@/lib/utils";

// Chat page: the two-pane frame (list | conversation). On phones only one
// pane shows: the list on /chat, the conversation on /chat/[id]. The frame
// runs from where it starts down to the bottom of the window (above the
// phone tab bar and the on-screen keyboard), measured rather than assumed,
// so the message box always sits on the bottom edge; only the chat list and
// the messages scroll, never the page.

/** Height from the frame's top to the visible bottom of the window. */
export function frameHeight(top: number, viewportHeight: number, tabBarHeight: number): number {
  return Math.max(240, Math.floor(viewportHeight - top - tabBarHeight));
}

export function ChatFrame({ list, children }: { list: React.ReactNode; children: React.ReactNode }) {
  const frame = useRef<HTMLElement>(null);
  // Phones show the conversation when a chat is open, else the list.
  const showConversationOnPhone = useSelectedLayoutSegment() !== null;

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const fit = () => {
      const tabBar = document.querySelector<HTMLElement>("[data-mobile-tab-bar]");
      const tabBarHeight = tabBar && getComputedStyle(tabBar).display !== "none" ? tabBar.offsetHeight : 0;
      // Measure from the top of the page, not the scrolled position.
      const top = element.getBoundingClientRect().top + window.scrollY;
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      element.style.height = `${frameHeight(top, viewport, tabBarHeight)}px`;
      window.scrollTo({ top: 0 });
    };
    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <main
      ref={frame}
      // Close enough before measuring (header 56/64 px, phone tab bar 56 px).
      // flex-none: inside the app's column layout, flex-1 would override the
      // height and let the frame grow with the messages, pushing the message
      // box below the window.
      className="flex h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] min-h-0 w-full min-w-0 flex-none overflow-hidden md:h-[calc(100dvh-4rem)]"
    >
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
