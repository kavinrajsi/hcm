"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Multi-series line chart (SVG, no chart library). Marks follow the dataviz
// specs: 2px lines, hairline recessive grid, legend for identity, a crosshair
// that snaps to the month and one tooltip listing every series. Colours are
// CSS variables set on .viz-root (globals.css) so dark mode has its own steps.

export type LineSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

const HEIGHT = 260;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

function niceMax(value: number): number {
  if (value <= 5) return 5;
  const step = 10 ** Math.floor(Math.log10(value));
  const normalized = value / step;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * step;
}

export function LineChart({
  labels,
  series,
  ariaLabel,
}: {
  labels: string[];
  series: LineSeries[];
  ariaLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  // Measure right away (no waiting for the first ResizeObserver tick, which
  // can be delayed), then track resizes.
  useLayoutEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const measure = (measuredWidth: number) =>
      setWidth(Math.max(280, Math.round(measuredWidth)));
    measure(element.clientWidth);
    const resizeObserver = new ResizeObserver(([entry]) =>
      measure(entry.contentRect.width),
    );
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  const pointCount = labels.length;
  const max = niceMax(
    Math.max(1, ...series.flatMap((seriesItem) => seriesItem.values)),
  );
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const xAt = (index: number) =>
    PAD.left +
    (pointCount <= 1 ? plotW / 2 : (index / (pointCount - 1)) * plotW);
  const yAt = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) =>
    Math.round(max * fraction),
  );
  // Show as many month labels as fit (~84px each).
  const every = Math.max(
    1,
    Math.ceil(pointCount / Math.max(2, Math.floor(plotW / 84))),
  );

  function pick(clientX: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || pointCount === 0) return;
    const offsetX = clientX - rect.left - PAD.left;
    const index = Math.round((offsetX / plotW) * (pointCount - 1));
    setActive(Math.min(pointCount - 1, Math.max(0, index)));
  }

  const tipLeft = active === null ? 0 : xAt(active);
  const tipOnRight = active !== null && tipLeft < width * 0.6;

  return (
    <div className="viz-root">
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {series.map((seriesItem) => (
          <li key={seriesItem.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-0.5 w-3 rounded-full"
              style={{ background: seriesItem.color }}
            />
            {seriesItem.label}
          </li>
        ))}
      </ul>
      <div
        ref={wrapRef}
        className="relative w-full touch-pan-y overflow-hidden outline-none"
        tabIndex={0}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(event) => pick(event.clientX)}
        onPointerDown={(event) => pick(event.clientX)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((current) => current ?? pointCount - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft")
            setActive((current) => Math.max(0, (current ?? pointCount) - 1));
          if (event.key === "ArrowRight")
            setActive((current) =>
              Math.min(pointCount - 1, (current ?? -1) + 1),
            );
        }}
      >
        <svg width={width} height={HEIGHT} className="block overflow-visible">
          {ticks.map((tickValue) => (
            <g key={tickValue}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={yAt(tickValue)}
                y2={yAt(tickValue)}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={yAt(tickValue)}
                dy="0.32em"
                textAnchor="end"
                className="fill-zinc-500 text-[11px] tabular-nums"
              >
                {tickValue.toLocaleString("en-IN")}
              </text>
            </g>
          ))}
          {labels.map((label, index) =>
            (index % every === 0 && pointCount - 1 - index >= every) ||
            index === pointCount - 1 ? (
              <text
                key={label}
                x={xAt(index)}
                y={HEIGHT - 8}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === pointCount - 1
                      ? "end"
                      : "middle"
                }
                className="fill-zinc-500 text-[11px]"
              >
                {label}
              </text>
            ) : null,
          )}
          {active !== null && (
            <line
              x1={xAt(active)}
              x2={xAt(active)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
          )}
          {series.map((seriesItem) => (
            <polyline
              key={seriesItem.key}
              fill="none"
              stroke={seriesItem.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={seriesItem.values
                .map((value, index) => `${xAt(index)},${yAt(value)}`)
                .join(" ")}
            />
          ))}
          {active !== null &&
            series.map((seriesItem) => (
              <circle
                key={seriesItem.key}
                cx={xAt(active)}
                cy={yAt(seriesItem.values[active] ?? 0)}
                r={4}
                fill={seriesItem.color}
                className="stroke-white dark:stroke-zinc-950"
                strokeWidth={2}
              />
            ))}
        </svg>
        {active !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-md border border-zinc-200 bg-background p-2 text-xs shadow-md dark:border-zinc-800"
            style={
              tipOnRight
                ? { left: tipLeft + 12 }
                : { right: width - tipLeft + 12 }
            }
          >
            <p className="mb-1 font-medium">{labels[active]}</p>
            <ul className="flex flex-col gap-0.5">
              {[...series]
                .sort(
                  (left, right) =>
                    (right.values[active] ?? 0) - (left.values[active] ?? 0),
                )
                .map((seriesItem) => (
                  <li key={seriesItem.key} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-0.5 w-3 rounded-full"
                      style={{ background: seriesItem.color }}
                    />
                    <span className="font-semibold tabular-nums">
                      {seriesItem.values[active] ?? 0}
                    </span>
                    <span className="text-zinc-500">{seriesItem.label}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
