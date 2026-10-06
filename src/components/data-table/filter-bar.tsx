"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { Calendar, Check, ChevronDown, ChevronLeft, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DATE_PRESETS, type DatePreset } from "@/lib/date-filter";
import { CustomRange, dateLabel } from "./add-filter";

// Vercel-style filter bar: a full-width search on top, then one dropdown
// per filter with checkboxes (several values each). It only writes the URL
// — repeated params for multi-selects (?role=a&role=b), the date preset in
// its param or a custom from/to — and the page builds the WHERE.

function useUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  function update(change: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams);
    change(params);
    params.delete("page"); // any filter change resets pagination
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`);
  }
  return { searchParams, update };
}

const triggerClass =
  "inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-background px-3 text-sm transition-colors hover:bg-muted data-popup-open:border-zinc-400 md:h-9 dark:border-zinc-800 dark:data-popup-open:border-zinc-600";
const popupClass =
  "z-50 max-h-(--available-height) origin-(--transform-origin) overflow-y-auto rounded-xl border border-zinc-200 bg-popover text-sm text-popover-foreground shadow-lg outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 dark:border-zinc-800";

/** Full-width search box writing ?{param}= (debounced). */
export function FilterSearch({ param = "q", placeholder }: { param?: string; placeholder: string }) {
  const { searchParams, update } = useUrl();
  const [value, setValue] = useState(searchParams.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function write(next: string) {
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () =>
        update((params) => {
          if (next.trim()) params.set(param, next.trim());
          else params.delete(param);
        }),
      300,
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          write(event.target.value);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-lg border border-zinc-200 bg-background pr-9 pl-9 text-sm outline-none focus-visible:border-zinc-400 md:h-9 dark:border-zinc-800 dark:focus-visible:border-zinc-600"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            write("");
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export type MultiOption = { value: string; label?: string; count?: number };

/**
 * A dropdown of checkboxes; ticked values go in repeated ?{param}= params.
 * The button reads "All {plural}", one label, or "A, B" / "3 selected".
 */
export function FilterMultiSelect({
  param,
  label,
  plural,
  options,
  searchable = false,
}: {
  param: string;
  label: string;
  plural: string;
  options: MultiOption[];
  /** Adds a "Find…" box for long lists. */
  searchable?: boolean;
}) {
  const { searchParams, update } = useUrl();
  const [query, setQuery] = useState("");
  const selected = new Set(searchParams.getAll(param).map((value) => value.toLowerCase()));
  const labelOf = (option: MultiOption) => option.label ?? option.value;
  const picked = options.filter((option) => selected.has(option.value.toLowerCase()));

  const summary =
    picked.length === 0
      ? `All ${plural}`
      : picked.length <= 2
        ? picked.map(labelOf).join(", ")
        : `${picked.length} ${plural.toLowerCase()} selected`;

  function toggle(option: MultiOption) {
    update((params) => {
      const current = params.getAll(param);
      const on = current.some((value) => value.toLowerCase() === option.value.toLowerCase());
      params.delete(param);
      const next = on
        ? current.filter((value) => value.toLowerCase() !== option.value.toLowerCase())
        : [...current, option.value];
      for (const value of next) params.append(param, value);
    });
  }

  const needle = query.trim().toLowerCase();
  const shown = needle ? options.filter((option) => labelOf(option).toLowerCase().includes(needle)) : options;

  return (
    <Popover.Root onOpenChange={(open) => !open && setQuery("")}>
      <Popover.Trigger className={cn(triggerClass, picked.length > 0 && "border-zinc-400 dark:border-zinc-600")}>
        <span className="sr-only">{label}: </span>
        <span className="truncate">{summary}</span>
        <ChevronDown className="size-4 shrink-0 text-zinc-500" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={16} className="z-50">
          <Popover.Popup className={cn(popupClass, "w-[min(18rem,calc(100vw-2rem))]")}>
            {searchable && (
              <div className="flex items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
                <Search className="size-4 text-zinc-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Find ${label.toLowerCase()}…`}
                  aria-label={`Find ${label.toLowerCase()}`}
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            )}
            <ul role="listbox" aria-multiselectable aria-label={label} className="max-h-72 overflow-y-auto p-1.5">
              {shown.length === 0 && <li className="px-2.5 py-6 text-center text-zinc-400">No matches</li>}
              {shown.map((option) => {
                const on = selected.has(option.value.toLowerCase());
                return (
                  <li key={option.value} role="option" aria-selected={on}>
                    <button
                      type="button"
                      onClick={() => toggle(option)}
                      className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left hover:bg-muted md:min-h-9"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          on ? "border-foreground bg-foreground text-background" : "border-zinc-300 dark:border-zinc-600",
                        )}
                      >
                        {on && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{labelOf(option)}</span>
                      {option.count !== undefined && (
                        <span className="text-xs text-zinc-400 tabular-nums">{option.count}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {picked.length > 0 && (
              <div className="border-t border-zinc-200 p-1.5 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => update((params) => params.delete(param))}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-zinc-500 hover:bg-muted hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** "Select date range": presets, or a custom range in ?from=&to=. */
export function FilterDateRange({
  param,
  presets,
  withTime = false,
}: {
  param: string;
  presets: DatePreset[];
  withTime?: boolean;
}) {
  const { searchParams, update } = useUrl();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const preset = searchParams.get(param);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const text = dateLabel({ preset, from, to });

  function set(changes: Record<string, string | null>) {
    update((params) => {
      for (const key of [param, "from", "to"]) params.delete(key);
      for (const [key, value] of Object.entries(changes)) if (value) params.set(key, value);
    });
    setOpen(false);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setCustom(Boolean(from || to));
      }}
    >
      <Popover.Trigger className={cn(triggerClass, text && "border-zinc-400 dark:border-zinc-600")}>
        <span className="flex min-w-0 items-center gap-2">
          <Calendar className="size-4 shrink-0 text-zinc-500" />
          <span className="truncate">{text ?? "Select date range"}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-zinc-500" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={16} className="z-50">
          <Popover.Popup className={cn(popupClass, "w-[min(22rem,calc(100vw-2rem))]")}>
            {custom ? (
              <>
                <button
                  type="button"
                  onClick={() => setCustom(false)}
                  className="flex w-full items-center gap-1 border-b border-zinc-200 px-3 py-2.5 text-left text-zinc-500 hover:text-foreground dark:border-zinc-800"
                >
                  <ChevronLeft className="size-4" /> Custom range
                </button>
                <CustomRange
                  from={from}
                  to={to}
                  withTime={withTime}
                  onApply={(rangeFrom, rangeTo) => set({ from: rangeFrom, to: rangeTo })}
                />
              </>
            ) : (
              <ul role="listbox" aria-label="Date range" className="p-1.5">
                {[
                  { key: "", label: "Any date", on: !text, pick: () => set({}) },
                  ...presets.map((key) => ({
                    key,
                    label: DATE_PRESETS[key],
                    on: preset === key && !from && !to,
                    pick: () => set({ [param]: key }),
                  })),
                ].map((row) => (
                  <li key={row.key || "any"} role="option" aria-selected={row.on}>
                    <button
                      type="button"
                      onClick={row.pick}
                      className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left hover:bg-muted md:min-h-9"
                    >
                      <span className="flex-1">{row.label}</span>
                      {row.on && <Check className="size-4" />}
                    </button>
                  </li>
                ))}
                <li role="option" aria-selected={Boolean(from || to)}>
                  <button
                    type="button"
                    onClick={() => setCustom(true)}
                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left hover:bg-muted md:min-h-9"
                  >
                    <span className="flex-1">Custom range…</span>
                    {(from || to) && <Check className="size-4" />}
                  </button>
                </li>
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
