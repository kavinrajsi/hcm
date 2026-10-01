"use client";

import { useState, useTransition } from "react";
import { CopyButton } from "@/app/(public)/mcp/instructions/copy-button";
import { revealWebhookUrl } from "./actions";

/** The webhook URL, key hidden until HR clicks Show (not in the page HTML). */
export function WebhookUrl() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
      <code className="min-w-0 flex-1 text-xs break-all">
        {url ?? "https://connect.madarth.com/api/webhooks/zeptomail?key=••••••••"}
      </code>
      {url ? (
        <>
          <CopyButton text={url} />
          <button type="button" onClick={() => setUrl(null)} className="text-xs text-zinc-500 hover:underline">
            Hide
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await revealWebhookUrl();
              setUrl(result.url ?? null);
              setError(result.error ?? null);
            })
          }
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {pending ? "Loading…" : "Show"}
        </button>
      )}
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}
