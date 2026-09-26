"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AddIcon, CloseIcon } from "@/components/icons";

const PHONE_QUERY = "(width < 48rem)";

function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True below md; false on the server (desktop markup is the SSR default). */
function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

/**
 * Inline "add" forms stay open on desktop; on phones they fold behind a
 * full-width button so the list stays in view. CSS-only breakpoint, so no
 * hydration flash.
 *
 * `mobileSheet`: on phones the button opens the form in a bottom sheet
 * instead of expanding it inline. The form renders once — inline on desktop
 * or inside the sheet on phones — so field ids never clash.
 */
export function CollapsibleForm({
  label,
  mobileSheet = false,
  children,
}: {
  label: string;
  mobileSheet?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isPhone = useIsPhone();

  if (mobileSheet) {
    return (
      <div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={<Button type="button" className="h-11 w-full md:hidden" />}
          >
            <AddIcon className="size-5" />
            {label}
          </SheetTrigger>
          {isPhone && (
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>{label}</SheetTitle>
              </SheetHeader>
              {/* The form's own card border/padding is redundant in a sheet. */}
              <div className="px-4 [&>form]:border-0 [&>form]:p-0">
                {children}
              </div>
            </SheetContent>
          )}
        </Sheet>
        {!isPhone && <div className="hidden md:block">{children}</div>}
      </div>
    );
  }

  return (
    <div>
      <Button
        type="button"
        variant={open ? "outline" : "default"}
        className="h-11 w-full md:hidden"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? (
          <CloseIcon className="size-5" />
        ) : (
          <AddIcon className="size-5" />
        )}
        {open ? "Close" : label}
      </Button>
      <div className={open ? "mt-3 md:mt-0" : "hidden md:block"}>
        {children}
      </div>
    </div>
  );
}
