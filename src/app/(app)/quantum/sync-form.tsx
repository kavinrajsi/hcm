"use client";

// Quantum Sheet: the "Sync from Basecamp" button in the page header.

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncQuantum, type QuantumSyncState } from "./actions";

export function QuantumSyncForm() {
  const [state, formAction, pending] = useActionState<QuantumSyncState, FormData>(
    () => syncQuantum(),
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
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p>
      )}
    </form>
  );
}
