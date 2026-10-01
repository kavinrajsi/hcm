"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEVICE_OSES, DEVICE_OS_LABELS } from "@/lib/devices/os";
import type { DeviceOs } from "@/generated/prisma/enums";
import { saveLaptopOsMap, type SettingsState } from "../provision/actions";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

/** Designation → usual laptop OS. Blank = no recommendation. */
export function LaptopOsMapForm({
  rows,
}: {
  rows: { designation: string; people: number; os: DeviceOs | null }[];
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveLaptopOsMap, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
        {rows.map((row) => (
          <li key={row.designation} className="grid grid-cols-[1fr_9rem] items-center gap-3 px-4 py-2">
            <span>
              {row.designation}
              <span className="text-xs text-zinc-500">
                {" "}
                · {row.people ? `${row.people} ${row.people === 1 ? "person" : "people"}` : "nobody now"}
              </span>
            </span>
            <select name={`os:${row.designation}`} defaultValue={row.os ?? ""} className={selectClass}>
              <option value="">No preference</option>
              {DEVICE_OSES.map((os) => (
                <option key={os} value={os}>
                  {DEVICE_OS_LABELS[os]}
                </option>
              ))}
            </select>
          </li>
        ))}
        <li className="grid grid-cols-[1fr_9rem] items-center gap-3 px-4 py-2">
          <Input name="newDesignation" placeholder="Another designation (optional)" />
          <select name="newOs" defaultValue="" className={selectClass}>
            <option value="">—</option>
            {DEVICE_OSES.map((os) => (
              <option key={os} value={os}>
                {DEVICE_OS_LABELS[os]}
              </option>
            ))}
          </select>
        </li>
      </ul>
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
