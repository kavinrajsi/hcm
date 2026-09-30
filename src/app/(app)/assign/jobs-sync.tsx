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
import type { JobsSyncStreamEvent } from "@/lib/assign/jobs-sync";

type Line = { id: number; text: string; tone: "info" | "ok" | "failed" };
type Run = {
  status: "running" | "done" | "error";
  log: Line[];
  total: number;
  processed: number;
  failed: number;
  summary?: string;
};

const TONE: Record<Line["tone"], string> = {
  info: "text-zinc-500",
  ok: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-600 dark:text-red-400",
};

/** HR: pull completed to-dos and comments from Basecamp, with live progress. */
export function JobsSyncButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const running = run?.status === "running";

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [run?.log.length]);

  async function start() {
    let lineId = 0;
    const apply = (update: (current: Run) => Run) =>
      setRun((current) => (current ? update(current) : current));
    const addLine = (text: string, tone: Line["tone"]) =>
      apply((current) => ({
        ...current,
        // Keep the panel light: the unchanged majority isn't listed.
        log: [...current.log.slice(-400), { id: lineId++, text, tone }],
      }));
    setRun({ status: "running", log: [], total: 0, processed: 0, failed: 0 });

    const handle = (event: JobsSyncStreamEvent) => {
      switch (event.type) {
        case "step":
          addLine(event.message, "info");
          break;
        case "total":
          apply((current) => ({ ...current, total: event.total }));
          break;
        case "job":
          apply((current) => ({
            ...current,
            processed: current.processed + 1,
            failed: current.failed + (event.status === "failed" ? 1 : 0),
          }));
          if (event.status !== "unchanged")
            addLine(
              `${event.bucket} · ${event.title} — ${event.status}${event.error ? ` (${event.error})` : ""}`,
              event.status === "failed" ? "failed" : "ok",
            );
          break;
        case "done":
          apply((current) => ({ ...current, status: "done", summary: event.summary }));
          router.refresh();
          break;
        case "error":
          apply((current) => ({ ...current, status: "error" }));
          addLine(event.message, "failed");
          break;
      }
    };

    try {
      const response = await fetch("/api/basecamp/jobs-sync", { method: "POST" });
      if (!response.ok || !response.body)
        throw new Error(
          response.status === 403
            ? "Only HR admins can sync from Basecamp."
            : `Sync request failed (${response.status}).`,
        );
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
          const event = JSON.parse(line) as JobsSyncStreamEvent;
          if (event.type === "done" || event.type === "error") finished = true;
          handle(event);
        }
        if (done) break;
      }
      if (!finished)
        handle({ type: "error", message: "Connection closed before the sync finished." });
    } catch (error) {
      handle({
        type: "error",
        message: error instanceof Error ? error.message : "Basecamp sync failed",
      });
    }
  }

  const percent =
    run?.status === "done"
      ? 100
      : run && run.total > 0
        ? Math.round((run.processed / run.total) * 100)
        : 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(true);
          if (!running) void start();
        }}
      >
        <RefreshCw className={running ? "size-4 animate-spin" : "size-4"} />
        {running ? "Syncing…" : "Sync jobs from Basecamp"}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Sync jobs from Basecamp</SheetTitle>
            <SheetDescription>
              Pulls every completed to-do with its comments. Unchanged to-dos are
              skipped.{running && " You can close this panel; the sync keeps going."}
            </SheetDescription>
          </SheetHeader>
          {run && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {run.status === "running"
                      ? run.total > 0
                        ? `Processing ${run.processed} of ${run.total}`
                        : "Walking projects…"
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
                {run.failed > 0 && (
                  <p className="mt-2 text-xs text-red-600">{run.failed} failed</p>
                )}
              </div>
              {run.summary && (
                <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
                  {run.summary}
                </p>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-zinc-200 p-3 font-mono text-xs dark:border-zinc-800">
                <ul className="flex flex-col gap-1">
                  {run.log.map((line) => (
                    <li key={line.id} className={TONE[line.tone]}>
                      {line.text}
                    </li>
                  ))}
                </ul>
                <div ref={logEnd} />
              </div>
              {!running && (
                <Button type="button" variant="outline" onClick={() => void start()}>
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
