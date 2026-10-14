"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { WidgetResult } from "@/lib/dashboard/run";
import type { Option, SourceMeta } from "@/lib/dashboard/sources";
import {
  CHART_LABELS,
  CHART_TYPES,
  RANGE_PRESETS,
  TIME_BUCKET_LABELS,
  TIME_BUCKETS,
  type ChartType,
  type RangePreset,
  type WidgetSpec,
} from "@/lib/dashboard/spec";
import { cn } from "@/lib/utils";
import { addWidget, fieldOptions, previewWidget, updateWidget } from "./actions";
import { WidgetView } from "./widget-view";

// Dashboard: build your own widget — pick the data, what to count, how to
// split it, filters, dates and a chart, with a live preview computed with
// your own access. Opens full screen on phones.

export type BuilderTarget =
  | { mode: "add"; dashboardId: string }
  | { mode: "edit"; widgetId: string; title: string; spec: WidgetSpec };

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";
const labelClass = "text-xs font-medium text-zinc-500";

function blankSpec(source: SourceMeta): WidgetSpec {
  return {
    source: source.key,
    measure: source.measures[0].key,
    dateField: source.dateFields[0]?.key,
    groupBy: undefined,
    filters: {},
    range: { preset: "all" },
    chart: "number",
    compare: false,
    limit: 10,
  };
}

export function WidgetBuilder({
  target,
  sources,
  onClose,
}: {
  target: BuilderTarget | null;
  sources: SourceMeta[];
  onClose: () => void;
}) {
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        {target && <BuilderForm key={target.mode === "edit" ? target.widgetId : "new"} target={target} sources={sources} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function BuilderForm({ target, sources, onClose }: { target: BuilderTarget; sources: SourceMeta[]; onClose: () => void }) {
  const router = useRouter();
  const first = sources[0];
  const [title, setTitle] = useState(target.mode === "edit" ? target.title : "");
  const [spec, setSpec] = useState<WidgetSpec>(target.mode === "edit" ? target.spec : blankSpec(first));
  const [preview, setPreview] = useState<WidgetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const source = sources.find((candidate) => candidate.key === spec.source) ?? first;
  const update = (patch: Partial<WidgetSpec>) => setSpec((current) => ({ ...current, ...patch }));

  // Live preview, a moment after the last change.
  const specKey = JSON.stringify(spec);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await previewWidget(JSON.parse(specKey));
        if (!cancelled) setPreview(result);
      } catch {
        if (!cancelled) setPreview({ kind: "message", message: "Couldn't load a preview." });
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [specKey]);

  const groupChoices = [
    ...(source.dateFields.length ? TIME_BUCKETS.map((bucket) => ({ value: `time:${bucket}`, label: `${TIME_BUCKET_LABELS[bucket]} (over time)` })) : []),
    ...source.fields.filter((field) => field.group).map((field) => ({ value: field.key, label: field.label })),
  ];
  const isNumber = spec.chart === "number";
  const byTime = spec.groupBy?.startsWith("time:");

  function chooseSource(key: string) {
    const next = sources.find((candidate) => candidate.key === key)!;
    setSpec({ ...blankSpec(next), chart: spec.chart, range: next.dateFields.length ? spec.range : { preset: "all" } });
  }

  function chooseChart(chart: ChartType) {
    // A chart needs something to split by; pick a sensible first choice.
    const groupBy = chart === "number" ? undefined : (spec.groupBy ?? (chart === "line" ? groupChoices[2]?.value : groupChoices.find((choice) => !choice.value.startsWith("time:"))?.value) ?? groupChoices[0]?.value);
    update({ chart, groupBy });
  }

  function save() {
    setError(null);
    const finalTitle = title.trim() || defaultTitle(source, spec);
    startSaving(async () => {
      const result =
        target.mode === "add"
          ? await addWidget(target.dashboardId, { title: finalTitle, spec })
          : await updateWidget(target.widgetId, { title: finalTitle, spec });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{target.mode === "add" ? "Build a widget" : "Edit widget"}</SheetTitle>
        <SheetDescription>Numbers use your own access: you only ever see what your pages show you.</SheetDescription>
      </SheetHeader>

      <div className="grid gap-5 px-4 pb-4 md:grid-cols-[1fr_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Title</span>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={defaultTitle(source, spec)} maxLength={80} />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Data</span>
            <select className={selectClass} value={spec.source} onChange={(event) => chooseSource(event.target.value)}>
              {sources.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-zinc-500">{source.description}</span>
          </label>

          {source.measures.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Show</span>
              <select className={selectClass} value={spec.measure} onChange={(event) => update({ measure: event.target.value })}>
                {source.measures.map((measure) => (
                  <option key={measure.key} value={measure.key}>
                    {measure.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <fieldset className="flex flex-col gap-1">
            <legend className={cn(labelClass, "mb-1")}>Chart</legend>
            <div className="flex flex-wrap gap-1.5">
              {CHART_TYPES.map((chart) => (
                <button
                  key={chart}
                  type="button"
                  aria-pressed={spec.chart === chart}
                  onClick={() => chooseChart(chart)}
                  className={cn(
                    "min-h-9 rounded-md border px-3 text-sm md:min-h-8",
                    spec.chart === chart ? "border-foreground bg-muted font-medium" : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400",
                  )}
                >
                  {CHART_LABELS[chart]}
                </button>
              ))}
            </div>
          </fieldset>

          {!isNumber && (
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Split by</span>
              <select className={selectClass} value={spec.groupBy ?? ""} onChange={(event) => update({ groupBy: event.target.value || undefined })}>
                {groupChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {source.dateFields.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {source.dateFields.length > 1 && (
                <label className="col-span-2 flex flex-col gap-1">
                  <span className={labelClass}>Date to use</span>
                  <select className={selectClass} value={spec.dateField} onChange={(event) => update({ dateField: event.target.value })}>
                    {source.dateFields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="col-span-2 flex flex-col gap-1">
                <span className={labelClass}>Dates</span>
                <select
                  className={selectClass}
                  value={spec.range.preset}
                  onChange={(event) => update({ range: { preset: event.target.value as RangePreset } })}
                >
                  {(Object.keys(RANGE_PRESETS) as RangePreset[]).map((preset) => (
                    <option key={preset} value={preset}>
                      {RANGE_PRESETS[preset]}
                    </option>
                  ))}
                </select>
              </label>
              {spec.range.preset === "custom" && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>From</span>
                    <Input type="date" value={spec.range.from ?? ""} onChange={(event) => update({ range: { ...spec.range, from: event.target.value || undefined } })} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>To</span>
                    <Input type="date" value={spec.range.to ?? ""} onChange={(event) => update({ range: { ...spec.range, to: event.target.value || undefined } })} />
                  </label>
                </>
              )}
            </div>
          )}

          {isNumber && !["all", "upcoming", "to-month-end"].includes(spec.range.preset) && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={spec.compare} onChange={(event) => update({ compare: event.target.checked })} />
              Compare with the period before
            </label>
          )}

          {!isNumber && !byTime && (
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Show the top</span>
              <Input
                type="number"
                min={1}
                max={50}
                value={spec.limit}
                onChange={(event) => update({ limit: Math.min(50, Math.max(1, Number(event.target.value) || 1)) })}
              />
            </label>
          )}

          <div className="flex flex-col gap-2">
            <span className={labelClass}>Filters</span>
            {source.fields
              .filter((field) => field.filter)
              .map((field) => (
                <FilterPicker
                  key={`${source.key}:${field.key}`}
                  source={source.key}
                  field={field}
                  selected={spec.filters[field.key] ?? []}
                  onChange={(values) => {
                    const filters = { ...spec.filters, [field.key]: values };
                    if (!values.length) delete filters[field.key];
                    update({ filters });
                  }}
                />
              ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="sticky top-0 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs font-medium text-zinc-500">Preview</p>
            <h3 className="mt-1 font-medium">{title.trim() || defaultTitle(source, spec)}</h3>
            <div className="mt-3 max-h-[28rem] overflow-auto">
              {preview ? <WidgetView result={preview} title={title || "Preview"} /> : <p className="text-sm text-zinc-500">Loading…</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 mt-auto flex items-center justify-end gap-2 border-t border-zinc-200 bg-popover p-4 dark:border-zinc-800">
        {error && (
          <p role="alert" className="mr-auto text-sm text-red-600">
            {error}
          </p>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : target.mode === "add" ? "Add to dashboard" : "Save"}
        </Button>
      </div>
    </>
  );
}

/** "Leave by type", "Employees", "Quantum hours by month"… */
function defaultTitle(source: SourceMeta, spec: WidgetSpec): string {
  const measure = source.measures.find((candidate) => candidate.key === spec.measure);
  const base = source.measures.length > 1 && measure ? `${source.label} — ${measure.label.toLowerCase()}` : source.label;
  if (spec.chart === "number" || !spec.groupBy) return base;
  if (spec.groupBy.startsWith("time:")) return `${base} by ${spec.groupBy.slice(5)}`;
  const field = source.fields.find((candidate) => candidate.key === spec.groupBy);
  return field ? `${base} by ${field.label.toLowerCase()}` : base;
}

function FilterPicker({
  source,
  field,
  selected,
  onChange,
}: {
  source: string;
  field: SourceMeta["fields"][number];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(selected.length > 0);
  const [options, setOptions] = useState<Option[] | null>(field.options);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || options) return;
    let cancelled = false;
    fieldOptions(source, field.key)
      .then((loaded) => !cancelled && setOptions(loaded))
      .catch(() => !cancelled && setOptions([]));
    return () => {
      cancelled = true;
    };
  }, [open, options, source, field.key]);

  const shown = (options ?? []).filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-10 w-full items-center justify-between px-3 text-left text-sm md:min-h-9"
      >
        <span>{field.label}</span>
        <span className="text-xs text-zinc-500">{selected.length ? `${selected.length} picked` : "Any"}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
          {(options?.length ?? 0) > 8 && (
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="mb-2" />
          )}
          {options === null ? (
            <p className="px-1 text-xs text-zinc-500">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="px-1 text-xs text-zinc-500">No values.</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto">
              {shown.map((option) => (
                <li key={option.value}>
                  <label className="flex min-h-9 items-center gap-2 rounded px-1 text-sm hover:bg-muted md:min-h-7">
                    <input type="checkbox" className="size-4" checked={selected.includes(option.value)} onChange={() => toggle(option.value)} />
                    <span className="truncate">{option.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 px-1 text-xs text-zinc-500 underline">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
