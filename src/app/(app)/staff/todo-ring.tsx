// A ring around a Staff photo splitting that person's open Basecamp to-dos:
// red overdue, amber dated but not yet due, grey without a date.

const RADIUS = 47;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 2; // between segments, in SVG units

const SEGMENTS = [
  { key: "overdue", className: "stroke-red-500" },
  { key: "upcoming", className: "stroke-amber-500" },
  { key: "undated", className: "stroke-zinc-300 dark:stroke-zinc-600" },
] as const;

export function TodoRing({
  overdue,
  upcoming,
  undated,
  children,
}: {
  overdue: number;
  upcoming: number;
  undated: number;
  children: React.ReactNode;
}) {
  const counts = { overdue, upcoming, undated };
  const total = overdue + upcoming + undated;
  const shown = SEGMENTS.filter((segment) => counts[segment.key] > 0);
  const gap = shown.length > 1 ? GAP : 0;
  let offset = 0;

  return (
    <span className="relative inline-flex rounded-full p-1">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${overdue} overdue, ${upcoming} upcoming, ${undated} no date`}
        className="pointer-events-none absolute inset-0 size-full -rotate-90"
      >
        {total === 0 ? (
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="3"
            className="stroke-zinc-200 dark:stroke-zinc-800"
          />
        ) : (
          shown.map((segment) => {
            const length = (counts[segment.key] / total) * CIRCUMFERENCE;
            const visible = Math.max(length - gap, 0.5);
            const arc = (
              <circle
                key={segment.key}
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                strokeWidth="5"
                strokeDasharray={`${visible} ${CIRCUMFERENCE - visible}`}
                strokeDashoffset={-offset}
                className={segment.className}
              />
            );
            offset += length;
            return arc;
          })
        )}
      </svg>
      {children}
    </span>
  );
}
