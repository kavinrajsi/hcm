"use client";

// Quantum Sheet: the "Sync from Basecamp" button. Reads the sync's streamed
// steps from /api/quantum/sync and shows them in a side drawer (full width
// on phones). Closing the drawer doesn't stop the sync; pressing the button
// while it runs reopens it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { QuantumSyncEvent } from "@/app/api/quantum/sync/route";
import { applySyncEvent, idleSteps, STEPS, stepDetail, type SyncState } from "./sync-progress";

export function QuantumSyncForm() {
  const router = useRouter();
  const [state, setState] = useState<SyncState>({ running: false, steps: idleSteps() });
  const [open, setOpen] = useState(false);

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
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 md:h-8"
        onClick={() => (state.running ? setOpen(true) : void run())}
      >
        <RefreshCw className={state.running ? "size-4 animate-spin" : "size-4"} />
        {state.running ? "Syncing…" : "Sync from Basecamp"}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full data-[side=right]:w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{state.running ? "Syncing from Basecamp" : "Sync from Basecamp"}</SheetTitle>
            <SheetDescription>
              To-dos, cards and steps changed since the last sync, plus Basecamp timesheet hours.
            </SheetDescription>
          </SheetHeader>
          <div role="status" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <ol className="divide-y rounded-lg border">
              {STEPS.map((step) => {
                const stepState = state.steps[step.stage];
                return (
                  <li key={step.stage} className="flex min-h-12 items-center gap-3 px-3 py-2.5">
                    {stepState.status === "done" ? (
                      <Check className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : stepState.status === "running" && state.running ? (
                      <LoaderCircle className="size-5 shrink-0 animate-spin text-zinc-500" />
                    ) : (
                      <Circle className="size-5 shrink-0 text-zinc-300 dark:text-zinc-700" />
                    )}
                    <span className={stepState.status === "waiting" ? "text-zinc-400" : "font-medium"}>
                      {step.label}
                    </span>
                    <span className="ml-auto min-w-0 truncate text-right text-sm text-zinc-500 tabular-nums">
                      {stepDetail(step.stage, stepState)}
                    </span>
                  </li>
                );
              })}
            </ol>
            {state.result && (
              <p className="mt-4 font-medium text-emerald-600 dark:text-emerald-400">{state.result}</p>
            )}
            {state.error && (
              <p className="mt-4 flex items-start gap-1.5 text-red-600">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {state.error}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
