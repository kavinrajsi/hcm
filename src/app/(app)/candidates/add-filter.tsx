"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CREATED_PRESETS, type CreatedPreset } from "./created";

// Vercel-style "Add Filter" menu: pick a field (Status, Position, Role,
// Created), then a value. Like TableFilters it only writes the URL; the page
// does the WHERE.

/** A single-choice filter stored in one search param. */
export type OptionField = {
  param: string;
  label: string;
  options: { value: string; count?: number }[];
};

/** "menu", a field's param, or the Created steps. */
type Step = string;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const IST_MS = 330 * 60_000;

/** Today in IST, "YYYY-MM-DD". */
function istToday() {
  return new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
}

function shiftDay(day: string, by: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** "Sep 28" (plus the year when it isn't this year), "Sep 28 09:30" if timed. */
function formatPoint(value: string, withTime: boolean) {
  const [date, time] = value.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const year = String(y) === istToday().slice(0, 4) ? "" : `, ${y}`;
  return `${MONTHS[m - 1]} ${d}${year}${withTime && time ? ` ${time}` : ""}`;
}

function createdLabel(p: {
  created?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  if (p.from || p.to) {
    // Default times (whole days) aren't worth showing.
    const timed =
      (p.from?.includes("T") && !p.from.endsWith("T00:00")) ||
      (p.to?.includes("T") && !p.to.endsWith("T23:59"));
    const a = p.from ? formatPoint(p.from, !!timed) : "…";
    const b = p.to ? formatPoint(p.to, !!timed) : "…";
    return a === b ? a : `${a} – ${b}`;
  }
  return CREATED_PRESETS[p.created as CreatedPreset] ?? null;
}

export function AddFilter({ fields }: { fields: OptionField[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("menu");
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const created = searchParams.get("created");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const createdText = createdLabel({ created, from, to });

  function update(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page"); // any filter change resets pagination
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`);
  }

  function go(next: Step) {
    setStep(next);
    setQuery("");
    setHighlight(0);
    // Keep typing in the (re-rendered) search box.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function openAt(next: Step) {
    setStep(next);
    setQuery("");
    setHighlight(0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  // Rows for the current step, filtered by the search box.
  const q = query.trim().toLowerCase();
  const matches = (label: string) => label.toLowerCase().includes(q);
  type Row = {
    key: string;
    label: React.ReactNode;
    text: string;
    selected?: boolean;
    /** Opens a sub-step, or writes these params and closes. */
    next?: Step;
    set?: Record<string, string | null>;
  };
  let rows: Row[] = [];
  const field = fields.find((f) => f.param === step);
  if (step === "menu") {
    rows = [
      ...fields.map((f) => ({
        key: f.param,
        label: f.label,
        text: f.label,
        next: f.param,
      })),
      { key: "created", label: "Created", text: "Created", next: "created" },
    ];
  } else if (field) {
    const current = searchParams.get(field.param)?.toLowerCase();
    const any = `Any ${field.label}`;
    rows = [
      {
        key: "__any",
        label: any,
        text: any,
        selected: !current,
        set: { [field.param]: null },
      },
      ...field.options.map((o) => ({
        key: o.value,
        label: (
          <>
            <span className="truncate">{o.value}</span>
            {o.count !== undefined && (
              <span className="ml-auto pl-3 text-xs tabular-nums text-zinc-400">
                {o.count}
              </span>
            )}
          </>
        ),
        text: o.value,
        selected: current === o.value.toLowerCase(),
        set: { [field.param]: o.value },
      })),
    ];
  } else if (step === "created") {
    const isCustom = !!(from || to);
    rows = [
      {
        key: "__any",
        label: "Any Date",
        text: "Any Date",
        selected: !created && !isCustom,
        set: { created: null, from: null, to: null },
      },
      ...(Object.entries(CREATED_PRESETS) as [CreatedPreset, string][]).map(
        ([key, label]) => ({
          key,
          label,
          text: label,
          selected: !isCustom && created === key,
          set: { created: key, from: null, to: null },
        }),
      ),
      {
        key: "__custom",
        label: "Custom Date Range",
        text: "Custom Date Range",
        selected: isCustom,
        next: "custom" as const,
      },
    ];
  }
  rows = rows.filter((r) => matches(r.text));
  const active = Math.min(highlight, rows.length - 1);

  function choose(r: Row | undefined) {
    if (r?.next) go(r.next);
    else if (r?.set) {
      update(r.set);
      close();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = rows.length;
      if (n) setHighlight((active + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[active]);
    } else if (e.key === "Backspace" && !query && step !== "menu") {
      go(step === "custom" ? "created" : "menu");
    }
  }

  const fieldLabel =
    step === "menu" ? null : (field?.label ?? "Created");

  return (
    <div ref={anchorRef} className="flex flex-wrap items-center gap-2">
      <Popover.Root
        open={open}
        onOpenChange={(o, details) => {
          // A row that unmounts on click (switching steps) is detached by
          // the time the outside-press check runs, and chips reopen the
          // menu themselves — neither should close it.
          const target = details.event.target;
          if (
            !o &&
            details.reason === "outside-press" &&
            target instanceof Element &&
            (!target.isConnected || target.closest("[data-filter-chip]"))
          ) {
            details.cancel();
            return;
          }
          setOpen(o);
          if (o) {
            setStep("menu");
            setQuery("");
            setHighlight(0);
          }
        }}
      >
        <Popover.Trigger
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-zinc-300 bg-background px-3.5 text-sm font-medium transition-colors hover:bg-muted data-popup-open:bg-muted md:h-8 dark:border-zinc-700"
        >
          <ListFilter className="size-4" />
          Add Filter
        </Popover.Trigger>

        {fields.map((f) => {
          const value = searchParams.get(f.param);
          if (!value) return null;
          const option = f.options.find(
            (o) => o.value.toLowerCase() === value.toLowerCase(),
          );
          return (
            <Chip
              key={f.param}
              field={f.label}
              value={option?.value ?? value}
              onOpen={() => openAt(f.param)}
              onClear={() => update({ [f.param]: null })}
            />
          );
        })}
        {createdText && (
          <Chip
            field="Created"
            value={createdText}
            onOpen={() => openAt(from || to ? "custom" : "created")}
            onClear={() => update({ created: null, from: null, to: null })}
          />
        )}

        <Popover.Portal>
          <Popover.Positioner
            anchor={anchorRef}
            align="start"
            sideOffset={6}
            collisionPadding={16}
            className="z-50"
          >
            <Popover.Popup
              initialFocus={step === "custom" ? true : inputRef}
              className="w-[min(22rem,calc(100vw-2rem))] max-h-(--available-height) origin-(--transform-origin) overflow-y-auto rounded-xl border border-zinc-200 bg-popover text-sm text-popover-foreground shadow-lg outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 dark:border-zinc-800"
            >
              <div className="flex items-center border-b border-zinc-200 dark:border-zinc-800">
                {fieldLabel && (
                  <button
                    type="button"
                    onClick={() => go("menu")}
                    className="flex h-11 shrink-0 items-center gap-1 border-r border-zinc-200 px-3 hover:bg-muted dark:border-zinc-800"
                    aria-label={`${fieldLabel} – choose another field`}
                  >
                    {fieldLabel}
                    <ChevronDown className="size-3.5 text-zinc-500" />
                  </button>
                )}
                {step === "custom" ? (
                  <span className="truncate px-3 text-zinc-500">
                    {createdLabel({ from, to }) ?? "Pick a range"}
                  </span>
                ) : (
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setHighlight(0);
                    }}
                    onKeyDown={onKeyDown}
                    placeholder={step === "menu" ? "Filter by…" : "Filter to…"}
                    aria-label={step === "menu" ? "Filter by" : "Filter to"}
                    className="h-11 min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-zinc-400"
                  />
                )}
              </div>

              {step === "custom" ? (
                <CustomRange
                  from={from}
                  to={to}
                  onApply={(f, t) => {
                    update({ created: null, from: f, to: t });
                    close();
                  }}
                />
              ) : (
                <ul
                  role="listbox"
                  aria-label={fieldLabel ?? "Fields"}
                  className="max-h-72 overflow-y-auto p-1.5"
                >
                  {rows.length === 0 && (
                    <li className="px-2.5 py-6 text-center text-zinc-400">
                      No matches
                    </li>
                  )}
                  {rows.map((r, i) => (
                    <li
                      key={r.key}
                      role="option"
                      aria-selected={r.selected ?? false}
                      onMouseMove={() => setHighlight(i)}
                      onClick={() => choose(r)}
                      className={cn(
                        "flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 md:min-h-9",
                        i === active && "bg-muted",
                      )}
                    >
                      <span className="flex min-w-0 flex-1 items-center">
                        {r.label}
                      </span>
                      {r.next ? (
                        <ChevronRight className="size-4 shrink-0 text-zinc-500" />
                      ) : (
                        r.selected && <Check className="size-4 shrink-0" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function Chip({
  field,
  value,
  onOpen,
  onClear,
}: {
  field: string;
  value: string;
  onOpen: () => void;
  onClear: () => void;
}) {
  return (
    <span
      data-filter-chip
      className="inline-flex h-9 max-w-full items-center rounded-full border border-dashed border-zinc-300 text-sm md:h-8 dark:border-zinc-700">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full min-w-0 items-center gap-1 rounded-l-full pl-3.5 pr-1.5 hover:bg-muted"
      >
        <span className="text-zinc-500">{field}</span>
        <span className="truncate font-medium">{value}</span>
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${field} filter`}
        className="flex h-full items-center rounded-r-full pl-1 pr-2.5 text-zinc-400 hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

/** Month grid + start/end fields; dates and times are IST. */
function CustomRange({
  from,
  to,
  onApply,
}: {
  from: string | null;
  to: string | null;
  onApply: (from: string, to: string) => void;
}) {
  const today = istToday();
  const [start, setStart] = useState(from?.slice(0, 10) ?? today);
  const [end, setEnd] = useState(to?.slice(0, 10) ?? start);
  const [startTime, setStartTime] = useState(from?.slice(11, 16) || "00:00");
  const [endTime, setEndTime] = useState(to?.slice(11, 16) || "23:59");
  // Clicks alternate: first picks a new start, second closes the range.
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [month, setMonth] = useState(start.slice(0, 7));

  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay();
  const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((lead + inMonth) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) =>
    shiftDay(first, i - lead),
  );
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;

  function pick(day: string) {
    if (picking === "start") {
      setStart(day);
      setEnd(day);
      setPicking("end");
    } else {
      if (day < start) {
        setEnd(start);
        setStart(day);
      } else setEnd(day);
      setPicking("start");
    }
  }

  function stepMonth(by: number) {
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    setMonth(d.toISOString().slice(0, 7));
  }

  const valid = !!start && !!end && `${lo}T${startTime}` <= `${hi}T${endTime}`;
  const fieldClass =
    "h-9 min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm tabular-nums dark:bg-input/30";

  return (
    <form
      className="p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onApply(`${lo}T${startTime}`, `${hi}T${endTime}`);
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">
          {new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </span>
        <div className="flex">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            aria-label="Previous month"
            className="flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            aria-label="Next month"
            className="flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="py-1 text-xs text-zinc-500">
            {d}
          </span>
        ))}
        {days.map((day) => {
          const outside = day.slice(0, 7) !== month;
          const edge = day === lo || day === hi;
          const inRange = day > lo && day < hi;
          return (
            <button
              key={day}
              type="button"
              onClick={() => pick(day)}
              aria-label={day}
              aria-pressed={edge || inRange}
              className={cn(
                "my-0.5 flex h-9 items-center justify-center text-sm tabular-nums",
                outside && "text-zinc-400",
                inRange && "bg-muted",
                edge
                  ? "rounded-md bg-blue-600 font-medium text-white"
                  : "rounded-md hover:bg-muted",
                inRange && "rounded-none",
                !edge && day === today && "font-semibold underline underline-offset-4",
              )}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <label className="text-xs text-zinc-500" htmlFor="range-start">
          Start
        </label>
        <div className="-mt-1 grid grid-cols-[1fr_auto] gap-2">
          <input
            id="range-start"
            type="date"
            required
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value) setMonth(e.target.value.slice(0, 7));
            }}
            className={fieldClass}
          />
          <input
            type="time"
            aria-label="Start time"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={fieldClass}
          />
        </div>
        <label className="text-xs text-zinc-500" htmlFor="range-end">
          End
        </label>
        <div className="-mt-1 grid grid-cols-[1fr_auto] gap-2">
          <input
            id="range-end"
            type="date"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={fieldClass}
          />
          <input
            type="time"
            aria-label="End time"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className={fieldClass}
          />
        </div>
        <button
          type="submit"
          disabled={!valid}
          className="mt-1 h-9 rounded-md border border-zinc-200 font-medium hover:bg-muted disabled:opacity-50 dark:border-zinc-800"
        >
          Apply ↵
        </button>
        <p className="text-center text-xs text-zinc-400">Times in IST (Asia/Kolkata)</p>
      </div>
    </form>
  );
}
