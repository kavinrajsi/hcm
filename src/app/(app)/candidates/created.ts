// Created-date filter for candidates: presets and custom IST ranges.
// Kept free of server imports so the Add Filter menu can use it too.

export const CREATED_PRESETS = {
  "1h": "Last Hour",
  "24h": "Last 24 Hours",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  month: "This Month",
} as const;
export type CreatedPreset = keyof typeof CREATED_PRESETS;

const IST_MS = 330 * 60_000;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/;

/** An IST wall-clock "YYYY-MM-DD[THH:MM]" as an instant. */
export function parseIstDateTime(value?: string): Date | undefined {
  const m = value ? DATE_TIME.exec(value) : null;
  if (!m) return undefined;
  const d = new Date(`${m[1]}T${m[2] ?? "00:00"}:00Z`);
  return Number.isNaN(d.getTime())
    ? undefined
    : new Date(d.getTime() - IST_MS);
}

/**
 * createdAt bounds for a preset or custom range. Presets roll back from
 * `now` (This Month starts at IST midnight on the 1st). A date-only `to`
 * covers that whole day; a timed one covers that whole minute.
 */
export function createdRange(
  f: { created?: string; from?: string; to?: string },
  now = new Date(),
): { gte?: Date; lt?: Date } | undefined {
  if (f.from || f.to) {
    const gte = parseIstDateTime(f.from);
    const end = parseIstDateTime(f.to);
    const lt =
      end && new Date(end.getTime() + (f.to!.includes("T") ? 60_000 : 86_400_000));
    return gte || lt ? { gte, lt } : undefined;
  }
  const hours = { "1h": 1, "24h": 24, "7d": 168, "30d": 720 }[f.created ?? ""];
  if (hours) return { gte: new Date(now.getTime() - hours * 3_600_000) };
  if (f.created === "month") {
    const today = new Date(now.getTime() + IST_MS).toISOString();
    return { gte: parseIstDateTime(`${today.slice(0, 8)}01`) };
  }
  return undefined;
}
