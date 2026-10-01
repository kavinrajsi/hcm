"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { assignDevice, type DeviceFormState } from "../actions";

/** One standby (in stock) device with a button to give it to this person. */
export function StandbyAssign({ deviceId, employeeId }: { deviceId: string; employeeId: string }) {
  const [state, formAction, pending] = useActionState<DeviceFormState, FormData>(assignDevice, {});
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="deviceId" value={deviceId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <Button type="submit" size="sm" disabled={pending || Boolean(state.ok)}>
        {pending ? "Assigning…" : state.ok ? "Assigned" : "Give to them"}
      </Button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
