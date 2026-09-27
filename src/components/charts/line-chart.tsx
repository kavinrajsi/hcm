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

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const step = 10 ** Math.floor(Math.log10(v));
  const n = v / step;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
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
    const el = wrapRef.current;
    if (!el) return;
    const measure = (w: number) => setWidth(Math.max(280, Math.round(w)));
    measure(el.clientWidth);
    const ro = new ResizeObserver(([entry]) =>
      measure(entry.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = labels.length;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  // Show as many month labels as fit (~84px each).
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 84))));

  function pick(clientX: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const px = clientX - rect.left - PAD.left;
    const i = Math.round((px / plotW) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, i)));
  }

  const tipLeft = active === null ? 0 : x(active);
  const tipOnRight = active !== null && tipLeft < width * 0.6;

  return (
    <div className="viz-root">
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-0.5 w-3 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>
      <div
        ref={wrapRef}
        className="relative w-full touch-pan-y overflow-hidden outline-none"
        tabIndex={0}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((a) => a ?? n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft")
            setActive((a) => Math.max(0, (a ?? n) - 1));
          if (e.key === "ArrowRight")
            setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
        }}
      >
        <svg width={width} height={HEIGHT} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-zinc-500 text-[11px] tabular-nums"
              >
                {t.toLocaleString("en-IN")}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            (i % every === 0 && n - 1 - i >= every) || i === n - 1 ? (
              <text
                key={l}
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                className="fill-zinc-500 text-[11px]"
              >
                {l}
              </text>
            ) : null,
          )}
          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
          )}
          {series.map((s) => (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            />
          ))}
          {active !== null &&
            series.map((s) => (
              <circle
                key={s.key}
                cx={x(active)}
                cy={y(s.values[active] ?? 0)}
                r={4}
                fill={s.color}
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
                  (a, b) => (b.values[active] ?? 0) - (a.values[active] ?? 0),
                )
                .map((s) => (
                  <li key={s.key} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-0.5 w-3 rounded-full"
                      style={{ background: s.color }}
                    />
                    <span className="font-semibold tabular-nums">
                      {s.values[active] ?? 0}
                    </span>
                    <span className="text-zinc-500">{s.label}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
