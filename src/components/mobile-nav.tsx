"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { findCurrent, NAV, TABS } from "@/lib/nav";
import { useSidebar } from "@/components/ui/sidebar";
import {
  AccountCircleIcon,
  BadgeIcon,
  EventBusyIcon,
  EventIcon,
  HomeIcon,
  MenuIcon,
  PersonAddIcon,
  PersonIcon,
  PersonSearchIcon,
  type IconProps,
} from "@/components/icons";

const ICONS: Record<string, React.ComponentType<IconProps>> = {
  "/": HomeIcon,
  "/me": PersonIcon,
  "/profile": AccountCircleIcon,
  "/sessions": EventIcon,
  "/candidates": PersonSearchIcon,
  "/employees": BadgeIcon,
  "/leave": EventBusyIcon,
  "/onboarding": PersonAddIcon,
};

const SHORT_TITLES: Record<string, string> = { "/": "Home" };

const tabClass =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium";

/**
 * Phone-only bottom tab bar: four role-specific tabs plus "More", which
 * opens the existing sidebar sheet with every page.
 */
export function MobileTabBar({ role }: { role: Role }) {
  const pathname = usePathname();
  const current = findCurrent(pathname)?.item.url;
  const { openMobile, setOpenMobile } = useSidebar();
  const titles = new Map(
    NAV.flatMap((g) => g.items.map((i) => [i.url, i.title] as const)),
  );
  const tabs = TABS[role];
  const inTabs = current !== undefined && tabs.includes(current);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="flex">
        {tabs.map((url) => {
          const Icon = ICONS[url] ?? HomeIcon;
          const active = current === url && !openMobile;
          return (
            <li key={url} className="flex flex-1">
              <Link
                href={url}
                aria-current={active ? "page" : undefined}
                className={cn(
                  tabClass,
                  active ? "text-foreground" : "text-zinc-500",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-muted",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                {SHORT_TITLES[url] ?? titles.get(url)}
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            aria-expanded={openMobile}
            className={cn(
              tabClass,
              openMobile || (!inTabs && current !== undefined)
                ? "text-foreground"
                : "text-zinc-500",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                (openMobile || (!inTabs && current !== undefined)) &&
                  "bg-muted",
              )}
            >
              <MenuIcon className="size-5" />
            </span>
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
