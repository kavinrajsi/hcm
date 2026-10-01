"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { savePurchaseEmailSettings, type SettingsState } from "../provision/actions";

export function PurchaseEmailSettingsForm({ replyTo, cc }: { replyTo: string; cc: string[] }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(savePurchaseEmailSettings, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">From</span>
        <Input value="Madarth <noreply@madarth.com>" disabled readOnly />
        <span className="text-xs text-zinc-500">Fixed: the address the mail service is set up to send from.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Reply to</span>
        <Input type="email" name="replyTo" required defaultValue={replyTo} />
        <span className="text-xs text-zinc-500">Vendor replies go here.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">CC</span>
        <Textarea name="cc" rows={4} defaultValue={cc.join("\n")} />
        <span className="text-xs text-zinc-500">One address per line (commas work too). Add or remove anyone any time.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.ok && <p className="text-sm text-emerald-600">{state.ok}</p>}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
