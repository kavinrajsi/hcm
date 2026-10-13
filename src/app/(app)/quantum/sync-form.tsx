"use client";

// Quantum Sheet: the "Sync from Basecamp" button. Reads the sync's streamed
// steps from /api/quantum/sync and shows each one as it happens.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuantumSyncEvent } from "@/app/api/quantum/sync/route";
import { applySyncEvent, idleSteps, STEPS, type SyncState } from "./sync-progress";

export function QuantumSyncForm() {
  const router = useRouter();
  const [state, setState] = useState<SyncState>({ running: false, steps: idleSteps() });
  const started = state.running || state.result || state.error;

  async function run() {
    let current: SyncState = { running: true, steps: idleSteps() };
    setState(current);
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
    <div className="flex flex-col items-start gap-2 md:items-end">
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
      {started && (
        <div
          role="status"
          aria-live="polite"
          className="w-full min-w-64 rounded-lg border border-zinc-200 p-3 text-sm md:w-72 dark:border-zinc-800"
        >
          <ol className="flex flex-col gap-1.5">
            {STEPS.map((step) => {
              const { status, detail } = state.steps[step.stage];
              return (
                <li key={step.stage} className="flex items-start gap-2">
                  {status === "done" ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : status === "running" && state.running ? (
                    <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-zinc-500" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-zinc-300 dark:text-zinc-700" />
                  )}
                  <span className="min-w-0">
                    <span className={status === "waiting" ? "text-zinc-400" : undefined}>{step.label}</span>
                    {detail && <span className="block text-xs text-zinc-500">{detail}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          {state.result && (
            <p className="mt-2 text-emerald-600 dark:text-emerald-400">{state.result}</p>
          )}
          {state.error && (
            <p className="mt-2 flex items-start gap-1.5 text-red-600">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {state.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
