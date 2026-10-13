// Status page: turns stored checks into what the page shows — a colour per
// day for 90 days, uptime %, and the current state per service and overall.
// Pure, so it runs in tests without a database.

import { istDayKey } from "@/lib/format-date";
import { CHECK_INTERVAL_MINUTES, type CheckStatus } from "./services";

export type CheckRow = { checkedAt: Date; status: CheckStatus };

export type DayColor = "ok" | "degraded" | "minor" | "major" | "none";

export type DaySummary = {
  day: string; // YYYY-MM-DD (IST)
  color: DayColor;
  checks: number;
  /** Share of checks that weren't down, 0–100, or null with no checks. */
  uptime: number | null;
  degradedMinutes: number;
  downMinutes: number;
  /** Extra line for the tooltip, e.g. for days filled in from older logs. */
  note?: string;
};

export type DayCounts = { checks: number; degraded: number; down: number };

const DAY_MS = 86_400_000;

/** The last `days` IST days, oldest first, ending today. */
export function dayKeys(days: number, now = new Date()): string[] {
  return Array.from({ length: days }, (_, index) => istDayKey(new Date(now.getTime() - (days - 1 - index) * DAY_MS)));
}

/**
 * A day's colour, as on Atlassian status pages: green when every check was
 * fine, yellow with any degraded check, orange for under an hour down, red
 * for an hour or more, grey with no checks.
 */
export function dayColor(checks: number, degraded: number, down: number): DayColor {
  if (checks === 0) return "none";
  const downMinutes = down * CHECK_INTERVAL_MINUTES;
  if (downMinutes >= 60) return "major";
  if (down > 0) return "minor";
  if (degraded > 0) return "degraded";
  return "ok";
}

export function summarizeDays(rows: CheckRow[], days: number, now = new Date()): DaySummary[] {
  const counts = new Map<string, DayCounts>();
  for (const row of rows) {
    const key = istDayKey(row.checkedAt);
    const entry = counts.get(key) ?? { checks: 0, degraded: 0, down: 0 };
    entry.checks++;
    if (row.status === "degraded") entry.degraded++;
    if (row.status === "down") entry.down++;
    counts.set(key, entry);
  }
  return summarizeDayCounts(counts, days, now);
}

/** The same, from per-day counts (the page reads them already grouped). */
export function summarizeDayCounts(counts: Map<string, DayCounts>, days: number, now = new Date()): DaySummary[] {
  return dayKeys(days, now).map((day) => {
    const entry = counts.get(day) ?? { checks: 0, degraded: 0, down: 0 };
    return {
      day,
      color: dayColor(entry.checks, entry.degraded, entry.down),
      checks: entry.checks,
      uptime: entry.checks ? Math.round(((entry.checks - entry.down) / entry.checks) * 10000) / 100 : null,
      degradedMinutes: entry.degraded * CHECK_INTERVAL_MINUTES,
      downMinutes: entry.down * CHECK_INTERVAL_MINUTES,
    };
  });
}

/** Uptime over all checks (degraded counts as up), two decimals; null with none. */
export function uptimePercent(rows: { status: CheckStatus }[]): number | null {
  if (rows.length === 0) return null;
  const up = rows.filter((row) => row.status !== "down").length;
  return Math.floor((up / rows.length) * 10000) / 100;
}

export type OverallState = "operational" | "degraded" | "partial" | "major" | "unknown";

/** The banner: worst current state across services. */
export function overallState(current: (CheckStatus | null)[]): OverallState {
  const known = current.filter((status): status is CheckStatus => status !== null);
  if (known.length === 0) return "unknown";
  const down = known.filter((status) => status === "down").length;
  if (down >= Math.ceil(known.length / 2)) return "major";
  if (down > 0) return "partial";
  if (known.includes("degraded")) return "degraded";
  return "operational";
}

/**
 * A day filled in from an older log of real events (AI calls, emails) before
 * health checks began: coloured by the share that failed.
 */
export function summarizeEventDay(day: string, total: number, failed: number, what: string): DaySummary {
  const share = total ? failed / total : 0;
  const color: DayColor = total === 0 ? "none" : failed === 0 ? "ok" : share < 0.2 ? "degraded" : share < 0.5 ? "minor" : "major";
  return {
    day,
    color,
    checks: total,
    uptime: total ? Math.floor(((total - failed) / total) * 10000) / 100 : null,
    degradedMinutes: 0,
    downMinutes: 0,
    note: `${total} ${what}${failed ? `, ${failed} failed` : ""}`,
  };
}

/** Uptime across the days with data: the average of each day's uptime. */
export function averageUptime(days: DaySummary[]): number | null {
  const known = days.filter((day) => day.uptime !== null);
  if (known.length === 0) return null;
  return Math.floor((known.reduce((sum, day) => sum + day.uptime!, 0) / known.length) * 100) / 100;
}
