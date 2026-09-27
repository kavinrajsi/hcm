import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// AI Gateway usage log (Admin → AI usage). Every AI call records its tokens
// and the cost the Gateway reports in providerMetadata.gateway.cost (USD).

export type AiTrigger = "webhook" | "cron" | "manual-sync" | "script";

export const AI_FEATURE_LABELS: Record<string, string> = {
  "leave-classify": "Leave & WFH classification",
};

export const AI_TRIGGER_LABELS: Record<string, string> = {
  webhook: "Webhook",
  cron: "Daily sync",
  "manual-sync": "Sync button",
  script: "Script",
};

/** Cost (USD) and generation id from a Gateway response's providerMetadata. */
export function gatewayCost(providerMetadata: unknown): {
  costUsd: number | null;
  generationId: string | null;
} {
  const g =
    providerMetadata && typeof providerMetadata === "object"
      ? (providerMetadata as Record<string, unknown>).gateway
      : undefined;
  if (!g || typeof g !== "object") return { costUsd: null, generationId: null };
  const { cost, generationId } = g as Record<string, unknown>;
  const n = typeof cost === "number" ? cost : Number(cost);
  return {
    costUsd: cost == null || cost === "" || !Number.isFinite(n) ? null : n,
    generationId: typeof generationId === "string" ? generationId : null,
  };
}

/** Saves one call. Best-effort: a logging failure never breaks the AI call. */
export async function recordAiUsage(row: {
  feature: string;
  trigger?: AiTrigger;
  model: string;
  items: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number | null;
  generationId?: string | null;
  ok?: boolean;
}): Promise<void> {
  try {
    await db.aiUsage.create({
      data: {
        feature: row.feature,
        trigger: row.trigger ?? null,
        model: row.model,
        items: row.items,
        inputTokens: row.inputTokens ?? 0,
        outputTokens: row.outputTokens ?? 0,
        costUsd: row.costUsd ?? null,
        generationId: row.generationId ?? null,
        ok: row.ok ?? true,
      },
    });
  } catch (err) {
    console.error("[ai-usage] record failed", err);
  }
}

/** "$0", "$0.00042", "$1.23" — tiny per-call costs keep 2 significant digits. */
export function formatUsd(v: number): string {
  if (v === 0) return "$0";
  if (Math.abs(v) < 0.01) return `$${Number(v.toPrecision(2))}`;
  return `$${v.toFixed(2)}`;
}

export const AI_RANGES = ["month", "30d", "90d", "all"] as const;
export type AiRange = (typeof AI_RANGES)[number];
export const AI_RANGE_LABELS: Record<AiRange, string> = {
  month: "This month",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

const IST_MS = 330 * 60_000;

/** YYYY-MM-DD of an instant in Asia/Kolkata. */
export function istDay(d: Date): string {
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** Start of the range (midnight IST), or null for all time. */
export function rangeStart(range: AiRange, now = new Date()): Date | null {
  if (range === "all") return null;
  const today = istDay(now);
  const day =
    range === "month"
      ? `${today.slice(0, 8)}01`
      : istDay(new Date(now.getTime() - (range === "30d" ? 29 : 89) * 86_400_000));
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - IST_MS);
}

/** Every day from `from` to `to` (YYYY-MM-DD, inclusive), zero-filled. */
export function fillDays(
  rows: { day: string; cost: number; requests: number }[],
  from: string,
  to: string,
): { day: string; cost: number; requests: number }[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out = [];
  for (
    let d = new Date(`${from}T00:00:00Z`);
    d.toISOString().slice(0, 10) <= to;
    d = new Date(d.getTime() + 86_400_000)
  ) {
    const day = d.toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, cost: 0, requests: 0 });
  }
  return out;
}

export async function aiUsageSummary(range: AiRange, now = new Date()) {
  const start = rangeStart(range, now);
  const where = start ? { createdAt: { gte: start } } : {};

  const [totals, failed, breakdown, recent, dailyRows, first] =
    await Promise.all([
      db.aiUsage.aggregate({
        where,
        _count: true,
        _sum: {
          items: true,
          inputTokens: true,
          outputTokens: true,
          costUsd: true,
        },
      }),
      db.aiUsage.count({ where: { ...where, ok: false } }),
      db.aiUsage.groupBy({
        by: ["feature", "trigger", "model"],
        where,
        _count: true,
        _sum: {
          items: true,
          inputTokens: true,
          outputTokens: true,
          costUsd: true,
        },
      }),
      db.aiUsage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.$queryRaw<{ day: string; cost: number; requests: number }[]>`
        SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
               COALESCE(SUM("costUsd"), 0)::float8 AS cost,
               COUNT(*)::int AS requests
        FROM "AiUsage"
        WHERE ${start ? Prisma.sql`"createdAt" >= ${start}` : Prisma.sql`TRUE`}
        GROUP BY 1
        ORDER BY 1`,
      db.aiUsage.findFirst({
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);

  const cost = Number(totals._sum.costUsd ?? 0);
  const items = totals._sum.items ?? 0;
  const from = start ? istDay(start) : first ? istDay(first.createdAt) : null;
  return {
    firstRecordedAt: first?.createdAt ?? null,
    totals: {
      cost,
      requests: totals._count,
      failed,
      items,
      inputTokens: totals._sum.inputTokens ?? 0,
      outputTokens: totals._sum.outputTokens ?? 0,
      costPerItem: items > 0 ? cost / items : 0,
    },
    daily: from ? fillDays(dailyRows, from, istDay(now)) : [],
    breakdown: breakdown
      .map((b) => ({
        feature: b.feature,
        trigger: b.trigger,
        model: b.model,
        requests: b._count,
        items: b._sum.items ?? 0,
        inputTokens: b._sum.inputTokens ?? 0,
        outputTokens: b._sum.outputTokens ?? 0,
        cost: Number(b._sum.costUsd ?? 0),
      }))
      .sort((a, b) => b.cost - a.cost || b.requests - a.requests),
    recent: recent.map((r) => ({
      ...r,
      costUsd: r.costUsd === null ? null : Number(r.costUsd),
    })),
  };
}
