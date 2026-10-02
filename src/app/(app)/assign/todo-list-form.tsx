"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import type { FormState } from "@/lib/form-state";
import { setTodoList } from "./actions";

/** HR: where a recorded pick's "[test]" to-do goes in Basecamp. */
export function TodoListForm({ current }: { current: string | null }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(setTodoList, {});
  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-zinc-200 p-4 dark:border-zinc-800"
    >
      <label htmlFor="todo-list-url" className="text-sm font-medium">
        Basecamp to-do list for picks
      </label>
      <p className="text-xs text-zinc-500">
        Recording a pick creates a to-do here titled &ldquo;[test] &hellip;&rdquo;, assigned to the
        designer without notifying them. Leave empty to create nothing.
      </p>
      <div className="flex flex-col gap-2 md:flex-row md:items-start">
        <FormField name="url" className="md:flex-1">
          <Input
            id="todo-list-url"
            name="url"
            type="url"
            defaultValue={current ?? ""}
            placeholder="https://3.basecamp.com/…/buckets/…/todolists/…"
          />
        </FormField>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <FormMessage error={state.error} ok={state.ok} />
    </ValidatedForm>
  );
}
