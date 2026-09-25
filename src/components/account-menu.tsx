"use client";

import { useTheme } from "next-themes";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DarkModeIcon, LightModeIcon, LogoutIcon } from "@/components/icons";

const rowClass =
  "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-muted";

/** Phone header: initial avatar → bottom sheet with theme + sign out. */
export function AccountMenu({
  email,
  signOutAction,
}: {
  email: string;
  signOutAction: () => Promise<void>;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  // Sheet content only renders client-side after opening, so the resolved
  // theme is known here (no hydration mismatch to guard against).
  const dark = resolvedTheme === "dark";

  return (
    <Sheet>
      <SheetTrigger
        aria-label="Account"
        className="flex size-10 items-center justify-center rounded-full"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium uppercase">
          {email.charAt(0)}
        </span>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle>Account</SheetTitle>
          <SheetDescription className="truncate">{email}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-2">
          <button
            type="button"
            className={rowClass}
            onClick={() => setTheme(dark ? "light" : "dark")}
          >
            {dark ? (
              <LightModeIcon className="size-5 text-zinc-500" />
            ) : (
              <DarkModeIcon className="size-5 text-zinc-500" />
            )}
            {dark ? "Light mode" : "Dark mode"}
          </button>
          <form action={signOutAction}>
            <button
              type="submit"
              className={`${rowClass} text-red-600 dark:text-red-400`}
            >
              <LogoutIcon className="size-5" />
              Sign out
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
