"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncBasecampPeopleAction, type PeopleSyncState } from "./actions";

/** HR: pull people and profile pictures from Basecamp. */
export function BasecampSyncButton() {
  const [state, setState] = useState<PeopleSyncState | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setState(await syncBasecampPeopleAction());
          })
        }
      >
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
        {pending ? "Syncing…" : "Sync from Basecamp"}
      </Button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
      {state?.summary && (
        <div className="text-right text-xs text-zinc-500">
          <p role="status">{state.summary}</p>
          {state.unmatched && state.unmatched.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer">Unmatched people</summary>
              <ul className="mt-1 max-h-48 overflow-y-auto">
                {state.unmatched.map((person) => (
                  <li key={`${person.name}-${person.email}`}>
                    {person.name}
                    {person.email ? ` · ${person.email}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
