"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Donut chart (SVG, no chart library) with a legend that doubles as the
// table view: colour, label, value and share. Up to 8 slices; the rest fold
// into a neutral "Other". Values arrive formatted from the server.

export type Slice = { key: string; label: string; value: number; display: string; href?: string | null };

const MAX_SLICES = 8;
const SIZE = 132;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function fold(slices: Slice[]): (Slice & { color: string })[] {
  const positive = slices.filter((slice) => slice.value > 0);
  const kept = positive.length > MAX_SLICES ? positive.slice(0, MAX_SLICES - 1) : positive;
  const rest = positive.slice(kept.length);
  const colored = kept.map((slice, index) => ({
    ...slice,
    color: slice.key === "__other" ? "var(--viz-other)" : `var(--viz-series-${index + 1})`,
  }));
  if (rest.length === 0) return colored;
  const value = rest.reduce((sum, slice) => sum + slice.value, 0);
  return [
    ...colored,
    { key: "__folded", label: `Other (${rest.length})`, value, display: value.toLocaleString("en-IN"), color: "var(--viz-other)" },
  ];
}

export function DonutChart({ slices, ariaLabel, total }: { slices: Slice[]; ariaLabel: string; total: string }) {
  const [active, setActive] = useState<string | null>(null);
  const shown = fold(slices);
  const sum = shown.reduce((acc, slice) => acc + slice.value, 0);
  let offset = 0;
  return (
    <div className="viz-root flex flex-wrap items-center gap-4">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="size-28 shrink-0 -rotate-90 md:size-32"
        role="img"
        aria-label={`${ariaLabel}. ${shown.map((slice) => `${slice.label}: ${slice.display}`).join(", ")}`}
      >
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--viz-grid)" strokeWidth={STROKE} />
        {sum > 0 &&
          shown.map((slice) => {
            const length = (slice.value / sum) * CIRCUMFERENCE;
            const dash = `${Math.max(0, length - (shown.length > 1 ? 1.5 : 0))} ${CIRCUMFERENCE}`;
            const element = (
              <circle
                key={slice.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={slice.color}
                strokeWidth={active === slice.key ? STROKE + 4 : STROKE}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                opacity={active && active !== slice.key ? 0.4 : 1}
              />
            );
            offset += length;
            return element;
          })}
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="rotate-90 fill-foreground text-[18px] font-semibold tabular-nums"
          style={{ transformOrigin: "center" }}
        >
          {total}
        </text>
      </svg>
      <ul className="min-w-40 flex-1 space-y-1 text-sm">
        {shown.map((slice) => {
          const row = (
            <>
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: slice.color }} />
              <span className="min-w-0 flex-1 truncate">{slice.label}</span>
              <span className="font-medium tabular-nums">{slice.display}</span>
              <span className="w-9 text-right text-xs text-zinc-500 tabular-nums">
                {sum ? Math.round((slice.value / sum) * 100) : 0}%
              </span>
            </>
          );
          const className = cn("flex items-center gap-2 rounded px-1 py-0.5", slice.href && "hover:bg-muted");
          return (
            <li key={slice.key} onMouseEnter={() => setActive(slice.key)} onMouseLeave={() => setActive(null)}>
              {slice.href ? (
                <Link href={slice.href} className={className}>
                  {row}
                </Link>
              ) : (
                <div className={className}>{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
