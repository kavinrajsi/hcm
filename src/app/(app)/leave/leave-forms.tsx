"use client";

import { useActionState, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  type LeaveTypeValue,
} from "@/lib/leave";
import {
  getLeaveHistory,
  syncLeave,
  updateLeaveEntry,
  type LeaveEditState,
  type LeaveHistory,
  type LeaveSyncState,
} from "./actions";

const STATUS_TEXT: Record<LeaveHistory["entries"][number]["status"], string> = {
  PENDING: "text-amber-600 dark:text-amber-400",
  APPROVED: "text-emerald-600 dark:text-emerald-400",
  REJECTED: "text-rose-600 dark:text-rose-400",
};

/** Drawer opened from the edit modal (and phone cards): the poster's recent leave. */
export function LeaveHistoryDrawer({
  entryId,
  name,
}: {
  entryId: string;
  name: string;
}) {
  const [history, setHistory] = useState<LeaveHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  function load(open: boolean) {
    if (!open || history) return;
    startLoading(async () => {
      try {
        setHistory(await getLeaveHistory(entryId));
      } catch {
        setError("Couldn't load history.");
      }
    });
  }

  return (
    <Sheet onOpenChange={load}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 md:h-8"
          />
        }
      >
        History
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full data-[side=right]:w-full sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>{name} — leave history</SheetTitle>
          <SheetDescription>
            {history
              ? `${history.daysThisYear} day${history.daysThisYear === 1 ? "" : "s"} of leave in ${new Date().getFullYear()} (full + half, excluding rejected). Last ${history.entries.length} posts:`
              : "Recent posts from the Basecamp check-in."}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {loading && <p className="text-zinc-500">Loading…</p>}
          {error && <p className="text-red-600">{error}</p>}
          {history && history.entries.length === 0 && (
            <p className="text-zinc-500">No other posts.</p>
          )}
          <ul className="flex flex-col gap-2">
            {history?.entries.map((h) => (
              <li
                key={h.id}
                className={
                  h.id === entryId
                    ? "rounded-md border border-primary/50 px-3 py-2"
                    : "rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                }
              >
                <div className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="font-medium tabular-nums">{h.date}</span>
                  <span>
                    {h.type
                      ? LEAVE_TYPE_LABELS[h.type as LeaveTypeValue]
                      : "Unclassified"}
                  </span>
                  {h.days !== null && h.days > 0 && (
                    <span className="tabular-nums text-zinc-500">
                      {h.days}d
                    </span>
                  )}
                  <span className={STATUS_TEXT[h.status]}>
                    {h.status.charAt(0) + h.status.slice(1).toLowerCase()}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                  {h.message}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function LeaveSyncButton() {
  const [state, formAction, pending] = useActionState<LeaveSyncState, FormData>(
    () => syncLeave(),
    {},
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="h-10 md:h-8"
        disabled={pending}
      >
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
        {pending ? "Syncing…" : "Sync from Basecamp"}
      </Button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          {state.ok}
        </p>
      )}
    </form>
  );
}

export function LeaveEditDialog({
  entry,
  asButton = false,
}: {
  /** Phone cards render the trigger as a full-size outline button. */
  asButton?: boolean;
  entry: {
    id: string;
    creatorName: string;
    message: string;
    type: string | null;
    startDate: string;
    endDate: string;
    days: string;
  };
}) {
  const [state, formAction, pending] = useActionState<LeaveEditState, FormData>(
    updateLeaveEntry,
    {},
  );
  const selectClass =
    "h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

  return (
    <Dialog>
      {asButton ? (
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 md:h-8"
            />
          }
        >
          Edit
        </DialogTrigger>
      ) : (
        <DialogTrigger className="text-xs text-zinc-400 hover:text-foreground">
          Edit
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correct leave entry</DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {entry.creatorName}: {entry.message}
          </DialogDescription>
          <div>
            <LeaveHistoryDrawer entryId={entry.id} name={entry.creatorName} />
          </div>
        </DialogHeader>
        <form
          action={formAction}
          className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"
        >
          <input type="hidden" name="id" value={entry.id} />
          <label className="flex flex-col gap-1 sm:col-span-2">
            Type
            <select
              name="type"
              defaultValue={entry.type ?? "FULL_DAY"}
              className={selectClass}
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LEAVE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Start
            <Input
              type="date"
              name="startDate"
              defaultValue={entry.startDate}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            End
            <Input type="date" name="endDate" defaultValue={entry.endDate} />
          </label>
          <label className="flex flex-col gap-1">
            Days
            <Input
              type="number"
              name="days"
              step="0.5"
              min="0"
              defaultValue={entry.days}
              required
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            {state.error && <p className="text-red-600">{state.error}</p>}
            {state.ok && (
              <p className="text-emerald-600 dark:text-emerald-400">Saved.</p>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
