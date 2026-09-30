"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/employee-avatar";
import {
  BELIEF_LEVELS,
  BELIEF_LEVEL_LABELS,
  JOB_KINDS,
  JOB_KIND_LABELS,
} from "@/lib/assign/taxonomy";
import type { DesignerRef } from "@/lib/assign/suggest";
import { saveBeliefs, type BeliefState } from "../actions";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

export function BeliefsForm({ designers }: { designers: DesignerRef[] }) {
  const [state, formAction, pending] = useActionState<BeliefState, FormData>(
    saveBeliefs,
    {},
  );
  return (
    <form action={formAction} className="flex flex-col gap-6">
      {designers.map((designer) => (
        <section
          key={designer.personId}
          className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="flex items-center gap-3">
            <EmployeeAvatar name={designer.name} avatarKey={designer.avatarKey} />
            <div>
              <h2 className="font-medium">{designer.name}</h2>
              {designer.title && <p className="text-xs text-zinc-500">{designer.title}</p>}
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {JOB_KINDS.map((kind) => (
              <label key={kind} className="flex flex-col gap-1 text-sm">
                <span>{JOB_KIND_LABELS[kind]}</span>
                <select
                  name={`belief:${designer.personId}:${kind}`}
                  defaultValue="unknown"
                  className={selectClass}
                >
                  {BELIEF_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {BELIEF_LEVEL_LABELS[level]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Write these down"}
        </Button>
        <p className="text-xs text-zinc-500">Once saved they can&rsquo;t be edited &mdash; that&rsquo;s the point.</p>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
