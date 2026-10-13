// Status page: one real check per service, run every 5 minutes by
// /api/cron/health. Each is timed and capped at 8 seconds; none sends an
// email or spends AI credit. `detail` is for HR debugging and never appears
// on the public page.

import { gateway } from "ai";
import { list } from "@vercel/blob";
import { db } from "@/lib/db";
import { getAccessToken } from "@/lib/basecamp";
import { leaveSyncUserId } from "@/lib/leave-sync";
import { QUANTUM_SYNC_SETTING } from "@/lib/quantum/sync";
import type { CheckResult, ServiceKey } from "./services";

const TIMEOUT_MS = 8_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const ok = (latencyMs: number | null = null, detail: string | null = null): CheckResult => ({
  status: "ok",
  latencyMs,
  detail,
});
const degraded = (detail: string, latencyMs: number | null = null): CheckResult => ({
  status: "degraded",
  latencyMs,
  detail,
});
const down = (detail: string, latencyMs: number | null = null): CheckResult => ({ status: "down", latencyMs, detail });

/** Times `work`; slow answers are degraded, errors and timeouts are down. */
async function timed(work: () => Promise<string | null>, slowMs: number): Promise<CheckResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const detail = await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`No answer in ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS);
      }),
    ]);
    const latencyMs = Date.now() - started;
    return latencyMs > slowMs ? degraded(`Slow: ${latencyMs} ms`, latencyMs) : ok(latencyMs, detail);
  } catch (error) {
    return down(error instanceof Error ? error.message.slice(0, 300) : "Failed", Date.now() - started);
  } finally {
    clearTimeout(timer);
  }
}

/** The public site answers (the sign-in page). */
export function checkApp(origin = process.env.AUTH_URL ?? "http://localhost:3000") {
  return timed(async () => {
    const response = await fetch(`${origin.replace(/\/$/, "")}/login`, { cache: "no-store", redirect: "manual" });
    if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
    return null;
  }, 3_000);
}

export function checkDatabase() {
  return timed(async () => {
    await db.$queryRaw`SELECT 1`;
    return null;
  }, 1_500);
}

/** One light call through the HR admin's Basecamp connection. */
export function checkBasecamp() {
  return timed(async () => {
    const userId = await leaveSyncUserId();
    const token = userId && (await getAccessToken(userId));
    if (!token) throw new Error("No HR admin has connected Basecamp");
    const response = await fetch(`https://3.basecampapi.com/${token.accountId}/my/profile.json`, {
      headers: { Authorization: `Bearer ${token.accessToken}`, "User-Agent": "HCM Status (internal)" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return null;
  }, 3_000);
}

/** Credit left (free to ask) and how many AI calls failed in the last hour. */
export async function checkAi(now = new Date()): Promise<CheckResult> {
  const result = await timed(async () => {
    const { balance } = await gateway.getCredits();
    return balance;
  }, 3_000);
  if (result.status === "down") return result;
  const credit = Number(result.detail);
  if (Number.isFinite(credit) && credit <= 0) return down("No AI Gateway credit left", result.latencyMs);
  const recent = await db.aiUsage.groupBy({
    by: ["ok"],
    where: { createdAt: { gte: new Date(now.getTime() - HOUR) } },
    _count: true,
  });
  const total = recent.reduce((sum, row) => sum + row._count, 0);
  const failed = recent.find((row) => !row.ok)?._count ?? 0;
  if (total >= 5 && failed / total > 0.2) return degraded(`${failed} of ${total} AI calls failed in the last hour`, result.latencyMs);
  if (Number.isFinite(credit) && credit < 1) return degraded(`Low AI credit: $${credit.toFixed(2)}`, result.latencyMs);
  return result.status === "degraded"
    ? result
    : ok(result.latencyMs, Number.isFinite(credit) ? `Credit $${credit.toFixed(2)}` : null);
}

export function checkStorage() {
  return timed(async () => {
    await list({ limit: 1, token: process.env.BLOB_READ_WRITE_TOKEN });
    return null;
  }, 3_000);
}

/** Emails HCM tried to send in the last 24 hours; nothing is sent to check. */
export async function checkEmail(now = new Date()): Promise<CheckResult> {
  const rows = await db.emailLog.groupBy({
    by: ["status"],
    where: { createdAt: { gte: new Date(now.getTime() - 24 * HOUR) } },
    _count: true,
  });
  const count = (status: string) => rows.find((row) => row.status === status)?._count ?? 0;
  const failed = count("FAILED");
  const sent = count("SENT");
  if (failed > 0 && sent === 0 && failed >= 3) return down(`All ${failed} emails failed in the last 24 h`);
  if (failed > 0) return degraded(`${failed} of ${failed + sent} emails failed in the last 24 h`);
  return ok(null, `${sent} sent in the last 24 h`);
}

/** The latest run of each scheduled job. */
async function latestRuns(since: Date) {
  const runs = await db.cronRun.findMany({
    where: { startedAt: { gte: since } },
    orderBy: { startedAt: "desc" },
    select: { path: true, ok: true, startedAt: true },
  });
  const latest = new Map<string, { ok: boolean | null; startedAt: Date }>();
  for (const run of runs) if (!latest.has(run.path)) latest.set(run.path, run);
  return latest;
}

export async function checkJobs(now = new Date()): Promise<CheckResult> {
  const latest = await latestRuns(new Date(now.getTime() - 48 * HOUR));
  const failing = [...latest].filter(([, run]) => run.ok === false).map(([path]) => path.replace("/api/cron/", ""));
  if (failing.length >= 3) return down(`Failing: ${failing.join(", ")}`);
  if (failing.length > 0) return degraded(`Failing: ${failing.join(", ")}`);
  return ok(null, `${latest.size} jobs ran in the last 48 h`);
}

/** How long since each Basecamp sync last worked, against its schedule. */
export async function checkBasecampSync(now = new Date()): Promise<CheckResult> {
  const latest = await latestRuns(new Date(now.getTime() - 72 * HOUR));
  const lastGood = async (path: string, fallback: () => Promise<Date | null>) => {
    const run = latest.get(path);
    if (run?.ok) return run.startedAt;
    const okRun = await db.cronRun.findFirst({
      where: { path, ok: true },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    return okRun?.startedAt ?? (await fallback());
  };
  const [chat, quantum] = await Promise.all([
    lastGood("/api/cron/chat-sync", async () => {
      const newest = await db.basecampChat.aggregate({ _max: { lastCheckedAt: true } });
      return newest._max.lastCheckedAt;
    }),
    lastGood("/api/cron/quantum-sync", async () => {
      const setting = await db.appSetting.findUnique({ where: { key: QUANTUM_SYNC_SETTING } });
      const value = (setting?.value as { syncedThrough?: string } | null)?.syncedThrough;
      return value ? new Date(value) : null;
    }),
  ]);
  const age = (at: Date | null) => (at ? now.getTime() - at.getTime() : Infinity);
  const problems: string[] = [];
  let worst: "ok" | "degraded" | "down" = "ok";
  const judge = (name: string, at: Date | null, staleMs: number, deadMs: number) => {
    const ms = age(at);
    if (ms > deadMs) {
      worst = "down";
      problems.push(`${name}: no sync for ${Number.isFinite(ms) ? `${Math.round(ms / HOUR)} h` : "ever"}`);
    } else if (ms > staleMs) {
      if (worst === "ok") worst = "degraded";
      problems.push(`${name}: last sync ${Math.round(ms / MINUTE)} min ago`);
    }
  };
  // Chat syncs every 5 minutes; Quantum Sheet nightly.
  judge("Chat", chat, 20 * MINUTE, 24 * HOUR);
  judge("Quantum Sheet", quantum, 26 * HOUR, 72 * HOUR);
  const detail = problems.join("; ") || null;
  return worst === "ok" ? ok(null, detail) : worst === "degraded" ? degraded(detail!) : down(detail!);
}

/** Every service's check, run side by side. */
export async function runAllChecks(now = new Date()): Promise<Record<ServiceKey, CheckResult>> {
  const settle = (work: Promise<CheckResult>) =>
    work.catch((error: unknown) => down(error instanceof Error ? error.message.slice(0, 300) : "Check failed"));
  const [app, database, basecamp, basecampSync, ai, storage, email, jobs] = await Promise.all([
    settle(checkApp()),
    settle(checkDatabase()),
    settle(checkBasecamp()),
    settle(checkBasecampSync(now)),
    settle(checkAi(now)),
    settle(checkStorage()),
    settle(checkEmail(now)),
    settle(checkJobs(now)),
  ]);
  return { app, database, basecamp, "basecamp-sync": basecampSync, ai, storage, email, jobs };
}
