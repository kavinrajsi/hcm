"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Single-series column chart (SVG, no chart library), same conventions as
// LineChart: hairline grid, 4px rounded tops on the baseline, 2px gaps
// between bars, hover/keyboard tooltip. Values arrive pre-formatted from the
// server (`display`) so the client needs no formatter.

export type Bar = {
  key: string;
  label: string; // x-axis / tooltip title
  value: number;
  display: string; // formatted value
  detail?: string; // second tooltip line
};

const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 56 };

export function BarChart({
  bars,
  ariaLabel,
  formatTick,
}: {
  bars: Bar[];
  ariaLabel: string;
  /** Axis tick format; "usd" shows dollars. */
  formatTick?: "usd";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

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

  const n = bars.length;
  const rawMax = Math.max(0, ...bars.map((b) => b.value));
  const max = rawMax > 0 ? niceMax(rawMax) : 1;
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = n > 0 ? plotW / n : plotW;
  const gap = slot > 6 ? 2 : 0;
  const barW = Math.max(1, Math.min(40, slot - gap));
  const x = (i: number) => PAD.left + i * slot + (slot - barW) / 2;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, 0.5, 1].map((f) => max * f);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 64))));
  const tick = (v: number) =>
    formatTick === "usd"
      ? v === 0
        ? "$0"
        : v < 0.01
          ? `$${Number(v.toPrecision(2))}`
          : `$${v.toFixed(2)}`
      : v.toLocaleString("en-IN");

  function pick(clientX: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const i = Math.floor((clientX - rect.left - PAD.left) / slot);
    setActive(Math.min(n - 1, Math.max(0, i)));
  }

  const tipX = active === null ? 0 : x(active) + barW / 2;
  const tipOnRight = tipX < width * 0.6;

  return (
    <div className="viz-root">
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
        <svg width={width} height={HEIGHT} className="block">
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
                {tick(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const h = Math.max(0, PAD.top + plotH - y(b.value));
            if (h === 0) return null;
            const r = Math.min(4, barW / 2, h);
            const x0 = x(i);
            const y0 = y(b.value);
            const base = PAD.top + plotH;
            // Rounded top corners, square on the baseline.
            const d = `M${x0},${base}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + barW - r}Q${x0 + barW},${y0} ${x0 + barW},${y0 + r}V${base}Z`;
            return (
              <path
                key={b.key}
                d={d}
                fill="var(--viz-bar)"
                opacity={active === null || active === i ? 1 : 0.45}
              />
            );
          })}
          {bars.map((b, i) =>
            (i % every === 0 && n - 1 - i >= every) || i === n - 1 ? (
              <text
                key={b.key}
                x={x(i) + barW / 2}
                y={HEIGHT - 8}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                className="fill-zinc-500 text-[11px]"
              >
                {b.label}
              </text>
            ) : null,
          )}
        </svg>
        {active !== null && bars[active] && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-32 rounded-md border border-zinc-200 bg-background p-2 text-xs shadow-md dark:border-zinc-800"
            style={
              tipOnRight ? { left: tipX + 12 } : { right: width - tipX + 12 }
            }
          >
            <p className="font-medium">{bars[active].label}</p>
            <p className="mt-0.5 font-semibold tabular-nums">
              {bars[active].display}
            </p>
            {bars[active].detail && (
              <p className="text-zinc-500">{bars[active].detail}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function niceMax(v: number): number {
  const step = 10 ** Math.floor(Math.log10(v));
  const n = v / step;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * step;
}
