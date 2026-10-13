// Status page: everything the public page shows, read in a few grouped
// queries — per service, 90 days of daily colours, uptime and the latest
// state. Before health checks began, AI Gateway and Email days come from
// their real logs (AiUsage, EmailLog). Never returns check `detail`.

import { db } from "@/lib/db";
import { HISTORY_DAYS, SERVICES, type CheckStatus, type ServiceKey } from "./services";
import {
  averageUptime,
  overallState,
  summarizeDayCounts,
  summarizeEventDay,
  type DayCounts,
  type DaySummary,
  type OverallState,
} from "./summary";

export type ServiceStatus = {
  key: ServiceKey;
  name: string;
  description: string;
  current: CheckStatus | null;
  uptime: number | null;
  days: DaySummary[];
};

export type StatusPageData = {
  overall: OverallState;
  lastCheckedAt: Date | null;
  firstCheckedAt: Date | null;
  services: ServiceStatus[];
};

/** SQL for the IST calendar day (YYYY-MM-DD) of a timestamp column. */
const istDay = (column: string) =>
  `to_char(("${column}" AT TIME ZONE 'UTC') + interval '5 hours 30 minutes', 'YYYY-MM-DD')`;

export async function statusPageData(now = new Date()): Promise<StatusPageData> {
  const since = new Date(now.getTime() - (HISTORY_DAYS + 1) * 86_400_000);
  const [dayRows, latest, range, aiDays, emailDays] = await Promise.all([
    db.$queryRawUnsafe<{ service: string; day: string; checks: number; degraded: number; down: number }[]>(
      `SELECT service, ${istDay("checkedAt")} AS day, COUNT(*)::int AS checks,
              COUNT(*) FILTER (WHERE status = 'degraded')::int AS degraded,
              COUNT(*) FILTER (WHERE status = 'down')::int AS down
       FROM "HealthCheck" WHERE "checkedAt" >= $1 GROUP BY 1, 2`,
      since,
    ),
    db.$queryRawUnsafe<{ service: string; status: CheckStatus; checkedAt: Date }[]>(
      `SELECT DISTINCT ON (service) service, status, "checkedAt"
       FROM "HealthCheck" ORDER BY service, "checkedAt" DESC`,
    ),
    db.healthCheck.aggregate({ _min: { checkedAt: true }, _max: { checkedAt: true } }),
    db.$queryRawUnsafe<{ day: string; total: number; failed: number }[]>(
      `SELECT ${istDay("createdAt")} AS day, COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE NOT ok)::int AS failed
       FROM "AiUsage" WHERE "createdAt" >= $1 GROUP BY 1`,
      since,
    ),
    db.$queryRawUnsafe<{ day: string; total: number; failed: number }[]>(
      `SELECT ${istDay("createdAt")} AS day, COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
       FROM "EmailLog" WHERE "createdAt" >= $1 AND status <> 'NOT_SENT' GROUP BY 1`,
      since,
    ),
  ]);

  const firstCheck = range._min.checkedAt;
  const firstCheckDay = firstCheck ? new Date(firstCheck.getTime() + 330 * 60_000).toISOString().slice(0, 10) : null;
  const backfill: Partial<Record<ServiceKey, { rows: { day: string; total: number; failed: number }[]; what: string }>> = {
    ai: { rows: aiDays, what: "AI calls" },
    email: { rows: emailDays, what: "emails" },
  };

  const services = SERVICES.map((service) => {
    const counts = new Map<string, DayCounts>(
      dayRows
        .filter((row) => row.service === service.key)
        .map((row) => [row.day, { checks: row.checks, degraded: row.degraded, down: row.down }]),
    );
    let days = summarizeDayCounts(counts, HISTORY_DAYS, now);
    // Before checks began (or on days they missed), use the real event log.
    const extra = backfill[service.key];
    if (extra) {
      const byDay = new Map(extra.rows.map((row) => [row.day, row]));
      days = days.map((day) => {
        const events = byDay.get(day.day);
        const beforeChecks = !firstCheckDay || day.day < firstCheckDay;
        return day.checks === 0 && events && beforeChecks
          ? summarizeEventDay(day.day, events.total, events.failed, extra.what)
          : day;
      });
    }
    return {
      key: service.key,
      name: service.name,
      description: service.description,
      current: latest.find((row) => row.service === service.key)?.status ?? null,
      uptime: averageUptime(days),
      days,
    };
  });

  return {
    overall: overallState(services.map((service) => service.current)),
    lastCheckedAt: range._max.checkedAt,
    firstCheckedAt: firstCheck,
    services,
  };
}
