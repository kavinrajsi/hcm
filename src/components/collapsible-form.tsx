"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AddIcon, CloseIcon } from "@/components/icons";

/**
 * Inline "add" forms stay open on desktop; on phones they fold behind a
 * full-width button so the list stays in view. CSS-only breakpoint, so no
 * hydration flash.
 */
export function CollapsibleForm({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
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
