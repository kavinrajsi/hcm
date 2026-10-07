"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import type { FormState } from "@/lib/form-state";
import type { MadmaxCap } from "@/lib/madmax/cap";
import { setMadmaxCap } from "./actions";

/** HR: monthly MadMax AI caps in rupees; empty means no cap. */
export function CapForm({ cap }: { cap: MadmaxCap }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    setMadmaxCap,
    {},
  );
  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="perUserInr" label="Per person, per month (₹)">
          <Input
            name="perUserInr"
            inputMode="numeric"
            defaultValue={cap.perUserInr ?? ""}
            placeholder="No cap"
          />
        </FormField>
        <FormField name="totalInr" label="Whole company, per month (₹)">
          <Input
            name="totalInr"
            inputMode="numeric"
            defaultValue={cap.totalInr ?? ""}
            placeholder="No cap"
          />
        </FormField>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save caps"}
        </Button>
        <FormMessage error={state.error} ok={state.ok} />
      </div>
    </ValidatedForm>
  );
}
