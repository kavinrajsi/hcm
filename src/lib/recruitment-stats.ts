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
  let [year, month] = first.split("-").map(Number);
  const [lastYear, lastMonth] = last.split("-").map(Number);
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    out.push({ key, label: monthLabel(key) });
    month++;
    if (month > 12) {
      month = 1;
      year++;
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
    (min, record) => (min === null || record.month < min ? record.month : min),
    null,
  );
  const months = first ? monthRange(first, currentMonth) : [];
  const monthIndexByKey = new Map(
    months.map((month, index) => [month.key, index]),
  );

  const roles = new Map<string, RoleRow>();
  const stage = new Map<string, number>();
  let total = 0;
  for (const record of rows) {
    const role = record.role?.trim() || "Unspecified";
    const row =
      roles.get(role) ??
      ({
        role,
        total: 0,
        fullTime: 0,
        intern: 0,
        byMonth: months.map(() => 0),
      } satisfies RoleRow);
    row.total += record.n;
    if (record.position === "Intern") row.intern += record.n;
    else row.fullTime += record.n;
    const monthIndex = monthIndexByKey.get(record.month);
    if (monthIndex !== undefined) row.byMonth[monthIndex] += record.n;
    roles.set(role, row);

    const stageName =
      record.status &&
      PIPELINE_STAGES.concat("Rejected").includes(record.status)
        ? record.status
        : "New";
    stage.set(stageName, (stage.get(stageName) ?? 0) + record.n);
    total += record.n;
  }

  const sorted = [...roles.values()].sort(
    (left, right) =>
      right.total - left.total || left.role.localeCompare(right.role),
  );
  return {
    months,
    roles: sorted,
    monthTotals: months.map((_, monthIndex) =>
      sorted.reduce((sum, roleRow) => sum + roleRow.byMonth[monthIndex], 0),
    ),
    pipeline: PIPELINE_STAGES.map((stageName) => ({
      stage: stageName,
      count: stage.get(stageName) ?? 0,
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
