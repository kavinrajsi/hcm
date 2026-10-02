"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/form/form-field";
import type { FormState } from "@/lib/form-state";
import { setFloorManager } from "../actions";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:w-64 md:text-sm dark:bg-input/30";

/** HR: name the floor manager's account. He sees no suggestions until his beliefs are written. */
export function FloorManagerForm({
  accounts,
  current,
}: {
  accounts: { id: string; label: string }[];
  current: string | null;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    setFloorManager,
    {},
  );
  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-zinc-200 p-4 md:flex-row md:items-center dark:border-zinc-800"
    >
      <label htmlFor="floor-manager" className="text-sm md:mr-2">
        Floor manager
      </label>
      <select
        id="floor-manager"
        name="userId"
        defaultValue={current ?? ""}
        className={selectClass}
      >
        <option value="">Not set</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.label}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <FormMessage
        error={state.error ?? state.fieldErrors?.userId?.[0]}
        ok={state.ok ? "Saved." : undefined}
      />
    </form>
  );
}
