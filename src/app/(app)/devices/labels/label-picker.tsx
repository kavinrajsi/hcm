"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type PickerDevice = {
  id: string;
  assetTag: string;
  text: string;
  who: string;
};

/** Tick devices (or Select all), then show the A4 sheet for them. */
export function LabelPicker({ devices }: { devices: PickerDevice[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const all = picked.size === devices.length;
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form method="get" className="mt-6 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-3 px-4 text-sm font-medium">
          <input
            type="checkbox"
            checked={all}
            ref={(input) => {
              if (input) input.indeterminate = picked.size > 0 && !all;
            }}
            onChange={() =>
              setPicked(
                all ? new Set() : new Set(devices.map((device) => device.id)),
              )
            }
            className="size-4 accent-primary"
          />
          Select all ({devices.length})
          {picked.size > 0 && !all && (
            <span className="font-normal text-zinc-500">
              · {picked.size} picked
            </span>
          )}
        </label>
        <Button type="submit" disabled={picked.size === 0}>
          {picked.size ? `Show sheet (${picked.size})` : "Show sheet"}
        </Button>
      </div>
      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {devices.map((device) => (
          <li key={device.id}>
            <label className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm">
              <input
                type="checkbox"
                name="ids"
                value={device.id}
                checked={picked.has(device.id)}
                onChange={() => toggle(device.id)}
                className="size-4 accent-primary"
              />
              <span className="font-mono">{device.assetTag}</span>
              <span className="min-w-0 flex-1 truncate">{device.text}</span>
              <span className="hidden text-xs text-zinc-500 md:inline">
                {device.who}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </form>
  );
}
