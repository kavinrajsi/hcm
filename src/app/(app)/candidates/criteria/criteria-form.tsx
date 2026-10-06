"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import { saveRoleCriteria } from "./actions";

export function CriteriaForm({ role, criteria }: { role: string; criteria: string }) {
  const [state, action, pending] = useActionState(saveRoleCriteria, {});
  return (
    <ValidatedForm action={action} fieldErrors={state.fieldErrors} className="flex flex-col gap-2">
      <input type="hidden" name="role" value={role} />
      <FormField name="criteria" label={<span className="sr-only">What we look for in a {role}</span>}>
        <Textarea
          name="criteria"
          rows={4}
          maxLength={4000}
          defaultValue={criteria}
          placeholder={`What we look for in a ${role}: must-have skills and tools, experience, portfolio, nice-to-haves…`}
        />
      </FormField>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <FormMessage error={state.error} />
        {typeof state.ok === "string" && <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p>}
      </div>
    </ValidatedForm>
  );
}
