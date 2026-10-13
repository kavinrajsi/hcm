"use client";

// Quantum Sheet: the "Sync from Basecamp" button. Reads the sync's streamed
// steps from /api/quantum/sync and shows them in a small panel floating
// under the button (it never pushes the page), which hides itself a few
// seconds after a successful sync.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, LoaderCircle, RefreshCw, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuantumSyncEvent } from "@/app/api/quantum/sync/route";
import { applySyncEvent, idleSteps, STEPS, stepDetail, type SyncState } from "./sync-progress";

const AUTO_HIDE_MS = 8_000;

export function QuantumSyncForm() {
  const router = useRouter();
  const [state, setState] = useState<SyncState>({ running: false, steps: idleSteps() });
  const [open, setOpen] = useState(false);
  // Hovering or focusing the panel keeps it open so it can be read.
  const [holding, setHolding] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishedOk = !state.running && Boolean(state.result) && !state.error;
  useEffect(() => {
    if (!open || !finishedOk || holding) return;
    hideTimer.current = setTimeout(() => setOpen(false), AUTO_HIDE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [open, finishedOk, holding]);

  async function run() {
    let current: SyncState = { running: true, steps: idleSteps() };
    setState(current);
    setOpen(true);
    try {
      const response = await fetch("/api/quantum/sync", { method: "POST" });
      if (!response.ok || !response.body) throw new Error(`Sync failed (${response.status})`);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          current = applySyncEvent(current, JSON.parse(line) as QuantumSyncEvent);
          setState(current);
        }
      }
      if (current.running) current = { ...current, running: false, error: "The sync stopped before it finished." };
      setState(current);
      if (current.result) router.refresh();
    } catch (error) {
      setState({ ...current, running: false, error: error instanceof Error ? error.message : "Sync failed" });
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 md:h-8"
        disabled={state.running}
        onClick={run}
      >
        <RefreshCw className={state.running ? "size-4 animate-spin" : "size-4"} />
        {state.running ? "Syncing…" : "Sync from Basecamp"}
      </Button>
      {open && (
        <div
          role="status"
          aria-live="polite"
          onPointerEnter={() => setHolding(true)}
          onPointerLeave={() => setHolding(false)}
          onFocus={() => setHolding(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setHolding(false);
          }}
          className="absolute left-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg md:left-auto md:right-0"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-medium">{state.running ? "Syncing from Basecamp" : "Sync from Basecamp"}</p>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="-mr-1 flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <ol className="flex flex-col gap-1.5">
            {STEPS.map((step) => {
              const stepState = state.steps[step.stage];
              const detail = stepDetail(step.stage, stepState);
              return (
                <li key={step.stage} className="flex items-center gap-2">
                  {stepState.status === "done" ? (
                    <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : stepState.status === "running" && state.running ? (
                    <LoaderCircle className="size-4 shrink-0 animate-spin text-zinc-500" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-zinc-300 dark:text-zinc-700" />
                  )}
                  <span className={stepState.status === "waiting" ? "text-zinc-400" : undefined}>{step.label}</span>
                  <span className="ml-auto min-w-0 truncate text-right text-xs text-zinc-500 tabular-nums">{detail}</span>
                </li>
              );
            })}
          </ol>
          {state.result && (
            <p className="mt-3 border-t pt-2 text-emerald-600 dark:text-emerald-400">{state.result}</p>
          )}
          {state.error && (
            <p className="mt-3 flex items-start gap-1.5 border-t pt-2 text-red-600">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {state.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
