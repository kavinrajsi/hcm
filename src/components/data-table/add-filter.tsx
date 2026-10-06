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
import { formatDay } from "@/lib/format-date";
import { DATE_PRESETS, type DatePreset } from "@/lib/date-filter";

// Vercel-style "Add Filter" menu: pick a field (option lists plus one date
// field), then a value. Like TableFilters it only writes the URL; the page
// does the WHERE (see lib/date-filter for the date bounds).

/** A single-choice filter stored in one search param. */
export type OptionField = {
  param: string;
  label: string;
  /** `label` defaults to the value (shown and searched). */
  options: { value: string; label?: string; count?: number }[];
};

/** The date field: preset key in `param`, custom range in from/to. */
export type DateField = {
  param: string;
  label: string;
  presets: DatePreset[];
  /** Custom range picks times too (timestamp columns). */
  withTime?: boolean;
};

/** "menu", an option field's param, or the date steps. */
type Step = string;
const DATE_STEP = "__date";
const CUSTOM_STEP = "__custom";

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

/** "28/09/2026", or "28/09/2026 09:30" when timed. */
function formatPoint(value: string, withTime: boolean) {
  const [date, time] = value.split("T");
  return `${formatDay(date)}${withTime && time ? ` ${time}` : ""}`;
}

export function dateLabel(range: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  if (range.from || range.to) {
    // Default times (whole days) aren't worth showing.
    const timed =
      (range.from?.includes("T") && !range.from.endsWith("T00:00")) ||
      (range.to?.includes("T") && !range.to.endsWith("T23:59"));
    const startText = range.from ? formatPoint(range.from, !!timed) : "…";
    const endText = range.to ? formatPoint(range.to, !!timed) : "…";
    return startText === endText ? startText : `${startText} – ${endText}`;
  }
  return DATE_PRESETS[range.preset as DatePreset] ?? null;
}

/** Free-text search typed straight into the menu, e.g. ?q=. */
export type SearchField = {
  param: string;
  /** What the search matches, shown under the "Search" row. */
  hint?: string;
};

export function AddFilter({
  fields,
  date,
  search,
}: {
  fields: OptionField[];
  date: DateField;
  search?: SearchField;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("menu");
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const preset = searchParams.get(date.param);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const dateText = dateLabel({ preset, from, to });
  const clearDate = { [date.param]: null, from: null, to: null };

  function update(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
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

  function openAt(next: Step, presetQuery = "") {
    setStep(next);
    setQuery(presetQuery);
    setHighlight(0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  // Rows for the current step, filtered by the search box.
  const searchQuery = query.trim().toLowerCase();
  const matches = (label: string) => label.toLowerCase().includes(searchQuery);
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
  const field = fields.find((candidate) => candidate.param === step);
  if (step === "menu") {
    rows = [
      ...fields.map((optionField) => ({
        key: optionField.param,
        label: optionField.label,
        text: optionField.label,
        next: optionField.param,
      })),
      { key: DATE_STEP, label: date.label, text: date.label, next: DATE_STEP },
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
      ...field.options.map((option) => ({
        key: option.value,
        label: (
          <>
            <span className="truncate">{option.label ?? option.value}</span>
            {option.count !== undefined && (
              <span className="ml-auto pl-3 text-xs tabular-nums text-zinc-400">
                {option.count}
              </span>
            )}
          </>
        ),
        text: option.label ?? option.value,
        selected: current === option.value.toLowerCase(),
        set: { [field.param]: option.value },
      })),
    ];
  } else if (step === DATE_STEP) {
    const isCustom = !!(from || to);
    rows = [
      {
        key: "__any",
        label: "Any Date",
        text: "Any Date",
        selected: !preset && !isCustom,
        set: clearDate,
      },
      ...date.presets.map((key) => ({
        key,
        label: DATE_PRESETS[key],
        text: DATE_PRESETS[key],
        selected: !isCustom && preset === key,
        set: { ...clearDate, [date.param]: key },
      })),
      {
        key: "__custom",
        label: "Custom Date Range",
        text: "Custom Date Range",
        selected: isCustom,
        next: CUSTOM_STEP,
      },
    ];
  }
  rows = rows.filter((row) => matches(row.text));
  // Typing in the menu also offers a plain search, after any matching field.
  const typed = query.trim();
  if (search && step === "menu" && typed) {
    rows.push({
      key: "__search",
      label: (
        <span className="min-w-0">
          <span className="block truncate">
            Search <span className="font-medium">“{typed}”</span>
          </span>
          {search.hint && (
            <span className="block truncate text-xs text-zinc-500">
              {search.hint}
            </span>
          )}
        </span>
      ),
      text: typed,
      set: { [search.param]: typed },
    });
  }
  const active = Math.min(highlight, rows.length - 1);

  function choose(row: Row | undefined) {
    if (row?.next) go(row.next);
    else if (row?.set) {
      update(row.set);
      close();
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const rowCount = rows.length;
      if (rowCount)
        setHighlight(
          (active + (event.key === "ArrowDown" ? 1 : -1) + rowCount) % rowCount,
        );
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(rows[active]);
    } else if (event.key === "Backspace" && !query && step !== "menu") {
      go(step === CUSTOM_STEP ? DATE_STEP : "menu");
    }
  }

  const fieldLabel = step === "menu" ? null : (field?.label ?? date.label);

  return (
    <div ref={anchorRef} className="flex flex-wrap items-center gap-2">
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen, details) => {
          // A row that unmounts on click (switching steps) is detached by
          // the time the outside-press check runs, and chips reopen the
          // menu themselves — neither should close it.
          const target = details.event.target;
          if (
            !nextOpen &&
            details.reason === "outside-press" &&
            target instanceof Element &&
            (!target.isConnected || target.closest("[data-filter-chip]"))
          ) {
            details.cancel();
            return;
          }
          setOpen(nextOpen);
          if (nextOpen) {
            setStep("menu");
            setQuery("");
            setHighlight(0);
          }
        }}
      >
        <Popover.Trigger className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-zinc-300 bg-background px-3.5 text-sm font-medium transition-colors hover:bg-muted data-popup-open:bg-muted md:h-8 dark:border-zinc-700">
          <ListFilter className="size-4" />
          Add Filter
        </Popover.Trigger>

        {search && searchParams.get(search.param) && (
          <Chip
            field="Search"
            value={searchParams.get(search.param)!}
            onOpen={() => openAt("menu", searchParams.get(search.param)!)}
            onClear={() => update({ [search.param]: null })}
          />
        )}
        {fields.map((optionField) => {
          const value = searchParams.get(optionField.param);
          if (!value) return null;
          const option = optionField.options.find(
            (candidate) =>
              candidate.value.toLowerCase() === value.toLowerCase(),
          );
          return (
            <Chip
              key={optionField.param}
              field={optionField.label}
              value={option?.label ?? option?.value ?? value}
              onOpen={() => openAt(optionField.param)}
              onClear={() => update({ [optionField.param]: null })}
            />
          );
        })}
        {dateText && (
          <Chip
            field={date.label}
            value={dateText}
            onOpen={() => openAt(from || to ? CUSTOM_STEP : DATE_STEP)}
            onClear={() => update(clearDate)}
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
              initialFocus={step === CUSTOM_STEP ? true : inputRef}
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
                {step === CUSTOM_STEP ? (
                  <span className="truncate px-3 text-zinc-500">
                    {dateLabel({ from, to }) ?? "Pick a range"}
                  </span>
                ) : (
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setHighlight(0);
                    }}
                    onKeyDown={onKeyDown}
                    placeholder={
                      step !== "menu"
                        ? "Filter to…"
                        : search
                          ? "Search or filter by…"
                          : "Filter by…"
                    }
                    aria-label={step === "menu" ? "Filter by" : "Filter to"}
                    className="h-11 min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-zinc-400"
                  />
                )}
              </div>

              {step === CUSTOM_STEP ? (
                <CustomRange
                  from={from}
                  to={to}
                  withTime={date.withTime ?? false}
                  onApply={(rangeFrom, rangeTo) => {
                    update({ ...clearDate, from: rangeFrom, to: rangeTo });
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
                  {rows.map((row, rowIndex) => (
                    <li
                      key={row.key}
                      role="option"
                      aria-selected={row.selected ?? false}
                      onMouseMove={() => setHighlight(rowIndex)}
                      onClick={() => choose(row)}
                      className={cn(
                        "flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 md:min-h-9",
                        rowIndex === active && "bg-muted",
                      )}
                    >
                      <span className="flex min-w-0 flex-1 items-center">
                        {row.label}
                      </span>
                      {row.next ? (
                        <ChevronRight className="size-4 shrink-0 text-zinc-500" />
                      ) : (
                        row.selected && <Check className="size-4 shrink-0" />
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
      className="inline-flex h-9 max-w-full items-center rounded-full border border-dashed border-zinc-300 text-sm md:h-8 dark:border-zinc-700"
    >
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
export function CustomRange({
  from,
  to,
  withTime,
  onApply,
}: {
  from: string | null;
  to: string | null;
  withTime: boolean;
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

  const [year, monthNum] = month.split("-").map(Number);
  const first = `${month}-01`;
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay();
  const inMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const weeks = Math.ceil((lead + inMonth) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, dayIndex) =>
    shiftDay(first, dayIndex - lead),
  );
  const rangeStart = start <= end ? start : end;
  const rangeEnd = start <= end ? end : start;

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
    const target = new Date(Date.UTC(year, monthNum - 1 + by, 1));
    setMonth(target.toISOString().slice(0, 7));
  }

  const valid =
    !!start &&
    !!end &&
    `${rangeStart}T${startTime}` <= `${rangeEnd}T${endTime}`;
  const fieldClass =
    "h-9 min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm tabular-nums dark:bg-input/30";

  return (
    <form
      className="p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        if (withTime)
          onApply(`${rangeStart}T${startTime}`, `${rangeEnd}T${endTime}`);
        else onApply(rangeStart, rangeEnd);
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">
          {new Date(Date.UTC(year, monthNum - 1, 1)).toLocaleString("en-IN", {
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
        {["S", "M", "T", "W", "T", "F", "S"].map((weekday, weekdayIndex) => (
          <span key={weekdayIndex} className="py-1 text-xs text-zinc-500">
            {weekday}
          </span>
        ))}
        {days.map((day) => {
          const outside = day.slice(0, 7) !== month;
          const edge = day === rangeStart || day === rangeEnd;
          const inRange = day > rangeStart && day < rangeEnd;
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
                !edge &&
                  day === today &&
                  "font-semibold underline underline-offset-4",
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
        <div
          className={cn("-mt-1 grid gap-2", withTime && "grid-cols-[1fr_auto]")}
        >
          <input
            id="range-start"
            type="date"
            required
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              if (event.target.value) setMonth(event.target.value.slice(0, 7));
            }}
            className={fieldClass}
          />
          {withTime && (
            <input
              type="time"
              aria-label="Start time"
              required
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={fieldClass}
            />
          )}
        </div>
        <label className="text-xs text-zinc-500" htmlFor="range-end">
          End
        </label>
        <div
          className={cn("-mt-1 grid gap-2", withTime && "grid-cols-[1fr_auto]")}
        >
          <input
            id="range-end"
            type="date"
            required
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className={fieldClass}
          />
          {withTime && (
            <input
              type="time"
              aria-label="End time"
              required
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={fieldClass}
            />
          )}
        </div>
        <button
          type="submit"
          disabled={!valid}
          className="mt-1 h-9 rounded-md border border-zinc-200 font-medium hover:bg-muted disabled:opacity-50 dark:border-zinc-800"
        >
          Apply ↵
        </button>
        {withTime && (
          <p className="text-center text-xs text-zinc-400">
            Times in IST (Asia/Kolkata)
          </p>
        )}
      </div>
    </form>
  );
}
