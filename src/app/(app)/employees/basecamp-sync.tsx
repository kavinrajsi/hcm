"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { PeopleSyncStreamEvent } from "@/lib/basecamp-people";

type LogLine = {
  id: number;
  text: string;
  tone: "info" | "updated" | "unchanged" | "failed" | "error";
};

type SyncRun = {
  status: "running" | "done" | "error";
  log: LogLine[];
  total: number;
  counts: { updated: number; unchanged: number; failed: number };
  summary?: string;
  unmatched: { name: string; email: string }[];
};

const TONE_CLASSES: Record<LogLine["tone"], string> = {
  info: "text-zinc-500",
  updated: "text-emerald-600 dark:text-emerald-400",
  unchanged: "text-zinc-500",
  failed: "text-red-600 dark:text-red-400",
  error: "text-red-600 dark:text-red-400",
};

const STATUS_LABELS = {
  updated: "picture updated",
  unchanged: "already up to date",
  failed: "failed",
} as const;

/** HR: pull people and profile pictures from Basecamp, with live progress. */
export function BasecampSyncButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<SyncRun | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const running = run?.status === "running";

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [run?.log.length]);

  async function startSync() {
    let lineId = 0;
    const apply = (update: (current: SyncRun) => SyncRun) =>
      setRun((current) => (current ? update(current) : current));
    const addLine = (text: string, tone: LogLine["tone"]) =>
      apply((current) => ({
        ...current,
        log: [...current.log, { id: lineId++, text, tone }],
      }));

    setRun({
      status: "running",
      log: [],
      total: 0,
      counts: { updated: 0, unchanged: 0, failed: 0 },
      unmatched: [],
    });

    const handle = (event: PeopleSyncStreamEvent) => {
      switch (event.type) {
        case "step":
          addLine(event.message, "info");
          break;
        case "total":
          apply((current) => ({ ...current, total: event.total }));
          break;
        case "person":
          apply((current) => ({
            ...current,
            counts: {
              ...current.counts,
              [event.status]: current.counts[event.status] + 1,
            },
          }));
          addLine(
            `${event.empId} · ${event.name} — ${STATUS_LABELS[event.status]}${
              event.error ? ` (${event.error})` : ""
            }`,
            event.status,
          );
          break;
        case "done":
          apply((current) => ({
            ...current,
            status: "done",
            summary: event.summary,
            unmatched: event.result.unmatched,
          }));
          addLine("Sync finished.", "info");
          router.refresh();
          break;
        case "error":
          apply((current) => ({ ...current, status: "error" }));
          addLine(event.message, "error");
          break;
      }
    };

    try {
      const response = await fetch("/api/basecamp/people-sync", {
        method: "POST",
      });
      if (!response.ok || !response.body) {
        throw new Error(
          response.status === 403
            ? "Only HR admins can sync from Basecamp."
            : `Sync request failed (${response.status}).`,
        );
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as PeopleSyncStreamEvent;
          if (event.type === "done" || event.type === "error") finished = true;
          handle(event);
        }
        if (done) break;
      }
      if (!finished) {
        handle({
          type: "error",
          message: "Connection closed before the sync finished.",
        });
      }
    } catch (error) {
      handle({
        type: "error",
        message:
          error instanceof Error ? error.message : "Basecamp sync failed",
      });
    }
  }

  const processed = run
    ? run.counts.updated + run.counts.unchanged + run.counts.failed
    : 0;
  const percent =
    run?.status === "done"
      ? 100
      : run && run.total > 0
        ? Math.round((processed / run.total) * 100)
        : 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(true);
          if (!running) void startSync();
        }}
      >
        <RefreshCw className={running ? "size-4 animate-spin" : "size-4"} />
        {running ? "Syncing…" : "Sync from Basecamp"}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Sync from Basecamp</SheetTitle>
            <SheetDescription>
              Links Basecamp people to employees by email and refreshes profile
              pictures.
              {running && " You can close this panel; the sync keeps going."}
            </SheetDescription>
          </SheetHeader>

          {run && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {run.status === "running"
                      ? run.total > 0
                        ? `Processing ${processed} of ${run.total}`
                        : "Starting…"
                      : run.status === "done"
                        ? "Done"
                        : "Failed"}
                  </span>
                  <span className="tabular-nums text-zinc-500">{percent}%</span>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-300",
                      run.status === "error" ? "bg-red-500" : "bg-primary",
                    )}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {run.counts.updated} updated · {run.counts.unchanged} up to
                  date · {run.counts.failed} failed
                </p>
              </div>

              {run.summary && (
                <p
                  role="status"
                  className="rounded-md bg-muted px-3 py-2 text-sm"
                >
                  {run.summary}
                </p>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-zinc-200 p-3 font-mono text-xs dark:border-zinc-800">
                <ul className="flex flex-col gap-1">
                  {run.log.map((line) => (
                    <li key={line.id} className={TONE_CLASSES[line.tone]}>
                      {line.text}
                    </li>
                  ))}
                </ul>
                <div ref={logEnd} />
              </div>

              {run.unmatched.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer">
                    Unmatched Basecamp people ({run.unmatched.length})
                  </summary>
                  <p className="mt-1 text-xs text-zinc-500">
                    No employee has this email as work or personal email.
                  </p>
                  <ul className="mt-2 max-h-48 overflow-y-auto text-xs">
                    {run.unmatched.map((person) => (
                      <li key={`${person.name}-${person.email}`}>
                        {person.name}
                        {person.email ? ` · ${person.email}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {!running && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void startSync()}
                >
                  <RefreshCw className="size-4" />
                  Run again
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
