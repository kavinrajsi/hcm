"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon } from "lucide-react";
import { DASHBOARD_RANGES, RANGE_PRESETS } from "@/lib/dashboard/spec";

// Dashboard date picker (?range=): sets the period for every widget that
// shows one. Totals like "Active employees" and upcoming lists keep their own.

export function RangePicker() {
  const router = useRouter();
  const params = useSearchParams();
  const value = params.get("range") ?? "";
  return (
    <label className="relative inline-flex items-center">
      <CalendarIcon className="pointer-events-none absolute left-2 size-4 text-zinc-500" />
      <span className="sr-only">Dates for every widget</span>
      <select
        value={value}
        onChange={(event) => {
          const next = new URLSearchParams(params);
          if (event.target.value) next.set("range", event.target.value);
          else next.delete("range");
          router.push(`/?${next}`);
        }}
        title="Applies to widgets that show a period; totals and upcoming lists keep their own dates"
        className="h-10 rounded-md border border-input bg-transparent pr-2 pl-8 text-base md:h-8 md:text-sm dark:bg-input/30"
      >
        <option value="">Each widget&apos;s own dates</option>
        {DASHBOARD_RANGES.map((preset) => (
          <option key={preset} value={preset}>
            {RANGE_PRESETS[preset]}
          </option>
        ))}
      </select>
    </label>
  );
}
