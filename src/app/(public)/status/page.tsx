import Link from "next/link";
import { formatDay, formatDateTime } from "@/lib/format-date";
import { statusPageData, type ServiceStatus } from "@/lib/status/page-data";
import { CHECK_INTERVAL_MINUTES, HISTORY_DAYS, type CheckStatus } from "@/lib/status/services";
import type { DayColor, DaySummary, OverallState } from "@/lib/status/summary";
import { cn } from "@/lib/utils";

// Status: public page (no sign-in), like status.claude.com — every service
// HCM depends on, its state now, and 90 days of daily health from real
// checks every 5 minutes. Shows states and uptime only, never error details.

export const metadata = {
  title: "HCM status",
  description: "Live health of Madarth Connect and the services it depends on.",
};
// Fresh within a minute of the latest check.
export const revalidate = 60;

const CURRENT: Record<CheckStatus, { label: string; className: string }> = {
  ok: { label: "Operational", className: "text-emerald-700 dark:text-emerald-400" },
  degraded: { label: "Degraded performance", className: "text-amber-600 dark:text-amber-400" },
  down: { label: "Outage", className: "text-red-600 dark:text-red-400" },
};

const OVERALL: Record<OverallState, { label: string; className: string }> = {
  operational: { label: "All systems operational", className: "bg-emerald-600 text-white" },
  degraded: { label: "Some systems are running slowly", className: "bg-amber-500 text-black" },
  partial: { label: "Partial outage", className: "bg-orange-600 text-white" },
  major: { label: "Major outage", className: "bg-red-600 text-white" },
  unknown: { label: "Checks are starting — no results yet", className: "bg-zinc-500 text-white" },
};

const BAR: Record<DayColor, string> = {
  ok: "bg-emerald-500",
  degraded: "bg-amber-400",
  minor: "bg-orange-500",
  major: "bg-red-600",
  none: "bg-zinc-200 dark:bg-zinc-700",
};

function minutesText(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

function ago(at: Date, now: Date) {
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  return formatDateTime(at);
}

export default async function StatusPage() {
  const data = await statusPageData();
  const now = new Date();
  const overall = OVERALL[data.overall];
  return (
    <main className="min-h-dvh bg-zinc-50 px-4 py-8 text-zinc-900 md:py-14 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Madarth Connect status</h1>
          <Link href="/" className="text-sm text-zinc-500 underline-offset-4 hover:underline">
            Open HCM
          </Link>
        </header>

        <div className={cn("mt-6 rounded-lg px-5 py-4 text-lg font-medium", overall.className)}>
          {overall.label}
          {data.lastCheckedAt && (
            <span className="mt-0.5 block text-sm font-normal opacity-90">
              Last checked {ago(data.lastCheckedAt, now)}
            </span>
          )}
        </div>

        <p className="mt-8 flex flex-wrap items-baseline justify-between gap-2 text-sm text-zinc-500">
          <span>Uptime over the past {HISTORY_DAYS} days.</span>
          <span>Checked every {CHECK_INTERVAL_MINUTES} minutes.</span>
        </p>

        <ul className="mt-3 divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {data.services.map((service) => (
            <ServiceRow key={service.key} service={service} />
          ))}
        </ul>

        <footer className="mt-6 space-y-1 text-xs text-zinc-500">
          <p>
            Each bar is one day (IST). Green: no problems · yellow: slow at times · orange: down under an hour · red:
            down an hour or more · grey: no data.
          </p>
          <p>
            {data.firstCheckedAt
              ? `Health checks began ${formatDay(new Date(data.firstCheckedAt.getTime() + 330 * 60_000).toISOString().slice(0, 10))}. `
              : "Health checks haven\u2019t run yet. "}
            Earlier AI Gateway and Email days come from HCM&apos;s own logs of real AI calls and emails.
          </p>
        </footer>
      </div>
    </main>
  );
}

function ServiceRow({ service }: { service: ServiceStatus }) {
  const current = service.current ? CURRENT[service.current] : null;
  return (
    <li className="px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-semibold">
          {service.name} <span className="font-normal text-zinc-500">· {service.description}</span>
        </h2>
        <span className={cn("text-sm font-medium", current?.className ?? "text-zinc-500")}>
          {current?.label ?? "No data yet"}
        </span>
      </div>
      <ol className="mt-3 flex h-9 gap-[2px]" aria-label={`${service.name}, last ${HISTORY_DAYS} days`}>
        {service.days.map((day, index) => (
          <DayBar key={day.day} day={day} alignRight={index > service.days.length / 2} />
        ))}
      </ol>
      <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
        <span className="shrink-0">{HISTORY_DAYS} days ago</span>
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        <span className="shrink-0 font-medium text-zinc-700 dark:text-zinc-300">
          {service.uptime === null ? "No data" : `${service.uptime.toFixed(2)} % uptime`}
        </span>
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        <span className="shrink-0">Today</span>
      </div>
    </li>
  );
}

/** One day's bar; hovering or tapping it shows the day's details. */
function DayBar({ day, alignRight }: { day: DaySummary; alignRight: boolean }) {
  const lines = [
    formatDay(day.day),
    day.uptime === null ? "No data" : `${day.uptime.toFixed(2)} % uptime`,
    day.downMinutes ? `Down ${minutesText(day.downMinutes)}` : null,
    day.degradedMinutes ? `Slow ${minutesText(day.degradedMinutes)}` : null,
    day.note ?? null,
  ].filter(Boolean);
  return (
    <li className="group relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={lines.join(", ")}
        className={cn("block h-full w-full rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-zinc-400", BAR[day.color])}
      />
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full z-10 mb-2 hidden w-max max-w-52 rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-focus-within:block group-hover:block dark:bg-zinc-100 dark:text-zinc-900",
          alignRight ? "right-0" : "left-0",
        )}
      >
        {lines.map((line, index) => (
          <span key={index} className={cn("block", index === 0 && "font-semibold")}>
            {line}
          </span>
        ))}
      </span>
    </li>
  );
}
