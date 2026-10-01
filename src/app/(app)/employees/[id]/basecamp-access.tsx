"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { addToBasecamp, type BasecampAddState } from "../actions";

/** HR: add (or re-add) this employee to All-General Stuffs on Basecamp. */
export function BasecampAccess({ employeeId, linked }: { employeeId: string; linked: boolean }) {
  const [state, formAction, pending] = useActionState<BasecampAddState, FormData>(addToBasecamp, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3 text-sm">
      <input type="hidden" name="employeeId" value={employeeId} />
      <span className="text-zinc-500">{linked ? "Linked to a Basecamp person." : "Not linked to Basecamp yet."}</span>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Adding…" : "Add to All-General Stuffs"}
      </Button>
      {state.ok && <span className="text-emerald-600">{state.ok}</span>}
      {state.error && <span className="text-red-600">{state.error}</span>}
    </form>
  );
}
