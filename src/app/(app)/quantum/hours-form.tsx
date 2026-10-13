"use client";

// Quantum Sheet: the "Your hours" box on a to-do assigned to the viewer.

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logQuantumHours, type QuantumHoursState } from "./actions";

export function QuantumHoursForm({ todoId, hours }: { todoId: string; hours: number | null }) {
  const [state, formAction, pending] = useActionState<QuantumHoursState, FormData>(
    logQuantumHours,
    {},
  );
  const error = state.fieldErrors?.hours?.[0] ?? state.error;
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="todoId" value={todoId} />
      <div className="flex items-center gap-1.5">
        <Input
          name="hours"
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0"
          max="200"
          defaultValue={hours ?? ""}
          placeholder="0"
          aria-label="Your hours"
          className="h-10 w-20 md:h-8"
        />
        <Button type="submit" variant="outline" size="sm" className="h-10 md:h-8" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {state.ok && !error && <p className="text-xs text-emerald-600 dark:text-emerald-400">Saved.</p>}
    </form>
  );
}
