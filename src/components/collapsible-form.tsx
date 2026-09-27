"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AddIcon } from "@/components/icons";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Inline "add" forms stay open on desktop; on phones a full-width button
 * opens them in a bottom sheet so the list stays in view. The form renders
 * once — inline on desktop or inside the sheet on phones — so field ids
 * never clash.
 */
export function CollapsibleForm({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isPhone = useIsMobile();

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
            <div className="px-4 [&>div>form]:border-0 [&>div>form]:p-0 [&>form]:border-0 [&>form]:p-0">
              {children}
            </div>
          </SheetContent>
        )}
      </Sheet>
      {!isPhone && <div className="hidden md:block">{children}</div>}
    </div>
  );
}
