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

  const barCount = bars.length;
  const rawMax = Math.max(0, ...bars.map((bar) => bar.value));
  const max = rawMax > 0 ? niceMax(rawMax) : 1;
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = barCount > 0 ? plotW / barCount : plotW;
  const gap = slot > 6 ? 2 : 0;
  const barW = Math.max(1, Math.min(40, slot - gap));
  const xAt = (index: number) => PAD.left + index * slot + (slot - barW) / 2;
  const yAt = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const ticks = [0, 0.5, 1].map((fraction) => max * fraction);
  const every = Math.max(
    1,
    Math.ceil(barCount / Math.max(2, Math.floor(plotW / 64))),
  );
  const tick = (value: number) =>
    formatTick === "usd"
      ? value === 0
        ? "$0"
        : value < 0.01
          ? `$${Number(value.toPrecision(2))}`
          : `$${value.toFixed(2)}`
      : value.toLocaleString("en-IN");

  function pick(clientX: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || barCount === 0) return;
    const index = Math.floor((clientX - rect.left - PAD.left) / slot);
    setActive(Math.min(barCount - 1, Math.max(0, index)));
  }

  const tipX = active === null ? 0 : xAt(active) + barW / 2;
  const tipOnRight = tipX < width * 0.6;

  return (
    <div className="viz-root">
      <div
        ref={wrapRef}
        className="relative w-full touch-pan-y overflow-hidden outline-none"
        tabIndex={0}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(event) => pick(event.clientX)}
        onPointerDown={(event) => pick(event.clientX)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((current) => current ?? barCount - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft")
            setActive((current) => Math.max(0, (current ?? barCount) - 1));
          if (event.key === "ArrowRight")
            setActive((current) => Math.min(barCount - 1, (current ?? -1) + 1));
        }}
      >
        <svg width={width} height={HEIGHT} className="block">
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
                {tick(tickValue)}
              </text>
            </g>
          ))}
          {bars.map((bar, index) => {
            const barHeight = Math.max(0, PAD.top + plotH - yAt(bar.value));
            if (barHeight === 0) return null;
            const radius = Math.min(4, barW / 2, barHeight);
            const left = xAt(index);
            const top = yAt(bar.value);
            const base = PAD.top + plotH;
            // Rounded top corners, square on the baseline.
            const path = `M${left},${base}V${top + radius}Q${left},${top} ${left + radius},${top}H${left + barW - radius}Q${left + barW},${top} ${left + barW},${top + radius}V${base}Z`;
            return (
              <path
                key={bar.key}
                d={path}
                fill="var(--viz-bar)"
                opacity={active === null || active === index ? 1 : 0.45}
              />
            );
          })}
          {bars.map((bar, index) =>
            (index % every === 0 && barCount - 1 - index >= every) ||
            index === barCount - 1 ? (
              <text
                key={bar.key}
                x={xAt(index) + barW / 2}
                y={HEIGHT - 8}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === barCount - 1
                      ? "end"
                      : "middle"
                }
                className="fill-zinc-500 text-[11px]"
              >
                {bar.label}
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

function niceMax(value: number): number {
  const step = 10 ** Math.floor(Math.log10(value));
  const normalized = value / step;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * step;
}
