"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { rereadEvalComments, type RereadState } from "../actions";

/** HR: have the model re-read dev/holdout comments with the latest examples. */
export function RereadButton() {
  const [state, formAction, pending] = useActionState<RereadState, FormData>(
    rereadEvalComments,
    {},
  );
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Clearing…" : "Re-read dev & holdout with current examples"}
      </Button>
      {state.ok && <p className="text-sm text-emerald-600">{state.ok}</p>}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
