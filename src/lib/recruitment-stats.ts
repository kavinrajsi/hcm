import { db } from "@/lib/db";

// Dashboard recruitment stats from the website's candidates table:
// applications ("job postings") per role per month, and pipeline stages.
// Months are IST calendar months. Spam (honeypot) and local test
// submissions (localhost source) are left out.

export type MonthCol = { key: string; label: string }; // key = YYYY-MM
export type RoleRow = {
  role: string;
  total: number;
  fullTime: number;
  intern: number;
  byMonth: number[]; // aligned with months
};
export type RecruitmentStats = {
  months: MonthCol[];
  roles: RoleRow[]; // total desc
  monthTotals: number[];
  pipeline: { stage: string; count: number }[];
  rejected: number;
  total: number;
};

export const PIPELINE_STAGES = ["New", "Screening", "Interview", "Offer"];

type Row = {
  role: string | null;
  position: string | null;
  status: string | null;
  month: string; // YYYY-MM
  n: number;
};

const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Every month from `first` to `last` inclusive (YYYY-MM). */
export function monthRange(first: string, last: string): MonthCol[] {
  const out: MonthCol[] = [];
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ key, label: monthLabel(key) });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** Pure shaping of grouped rows — exported for tests. */
export function buildStats(
  rows: Row[],
  currentMonth: string,
): RecruitmentStats {
  const first = rows.reduce<string | null>(
    (min, r) => (min === null || r.month < min ? r.month : min),
    null,
  );
  const months = first ? monthRange(first, currentMonth) : [];
  const idx = new Map(months.map((m, i) => [m.key, i]));

  const roles = new Map<string, RoleRow>();
  const stage = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const role = r.role?.trim() || "Unspecified";
    const row =
      roles.get(role) ??
      ({
        role,
        total: 0,
        fullTime: 0,
        intern: 0,
        byMonth: months.map(() => 0),
      } satisfies RoleRow);
    row.total += r.n;
    if (r.position === "Intern") row.intern += r.n;
    else row.fullTime += r.n;
    const i = idx.get(r.month);
    if (i !== undefined) row.byMonth[i] += r.n;
    roles.set(role, row);

    const s =
      r.status && PIPELINE_STAGES.concat("Rejected").includes(r.status)
        ? r.status
        : "New";
    stage.set(s, (stage.get(s) ?? 0) + r.n);
    total += r.n;
  }

  const sorted = [...roles.values()].sort(
    (a, b) => b.total - a.total || a.role.localeCompare(b.role),
  );
  return {
    months,
    roles: sorted,
    monthTotals: months.map((_, i) =>
      sorted.reduce((sum, r) => sum + r.byMonth[i], 0),
    ),
    pipeline: PIPELINE_STAGES.map((s) => ({
      stage: s,
      count: stage.get(s) ?? 0,
    })),
    rejected: stage.get("Rejected") ?? 0,
    total,
  };
}

export async function getRecruitmentStats(): Promise<RecruitmentStats> {
  const rows = await db.$queryRaw<Row[]>`
    SELECT job_role AS role, position, status,
           to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month,
           count(*)::int AS n
    FROM candidates
    WHERE coalesce(honeypot, '') = ''
      AND coalesce(source_url, '') NOT LIKE '%localhost%'
    GROUP BY 1, 2, 3, 4`;
  const currentMonth = new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 7);
  return buildStats(rows, currentMonth);
}
