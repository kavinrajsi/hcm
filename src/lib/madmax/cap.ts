import { db } from "@/lib/db";
import { rangeStart } from "@/lib/ai-usage";

// Monthly MadMax AI spending caps (Admin → AI usage), in rupees: one per
// person and one for the whole company. Months run in Asia/Kolkata. Costs
// are the Gateway's USD figures at USD_INR_RATE.

export const MADMAX_CAP_SETTING = "madmax-cap";

export type MadmaxCap = { perUserInr: number | null; totalInr: number | null };

export const usdInrRate = () => Number(process.env.USD_INR_RATE) || 88;

/** A stored setting, or no caps when unset or malformed. */
export function readCap(value: unknown): MadmaxCap {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const amount = (raw: unknown) =>
    typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
  return {
    perUserInr: amount(record.perUserInr),
    totalInr: amount(record.totalInr),
  };
}

export async function madmaxCap(): Promise<MadmaxCap> {
  const row = await db.appSetting.findUnique({
    where: { key: MADMAX_CAP_SETTING },
  });
  return readCap(row?.value);
}

/** Why a new message is refused, or null when under both caps. */
export function capBlock(
  cap: MadmaxCap,
  spentInr: { user: number; total: number },
): string | null {
  if (cap.totalInr !== null && spentInr.total >= cap.totalInr) {
    return `MadMax AI has reached this month's company limit of ₹${cap.totalInr.toLocaleString("en-IN")}. It resets on the 1st; ask HR to raise it.`;
  }
  if (cap.perUserInr !== null && spentInr.user >= cap.perUserInr) {
    return `You've used your ₹${cap.perUserInr.toLocaleString("en-IN")} MadMax AI limit for this month. It resets on the 1st; ask HR to raise it.`;
  }
  return null;
}

const monthWhere = (now: Date) => ({
  feature: "madmax",
  createdAt: { gte: rangeStart("month", now)! },
});

/** This month's MadMax spend in rupees across everyone. */
export async function madmaxMonthInr(now = new Date()): Promise<number> {
  const total = await db.aiUsage.aggregate({
    where: monthWhere(now),
    _sum: { costUsd: true },
  });
  return Number(total._sum.costUsd ?? 0) * usdInrRate();
}

/** This month's MadMax spend in rupees, company-wide and for one person. */
export async function madmaxSpendInr(userId: string, now = new Date()) {
  const [total, user] = await Promise.all([
    madmaxMonthInr(now),
    db.aiUsage.aggregate({
      where: { ...monthWhere(now), userId },
      _sum: { costUsd: true },
    }),
  ]);
  return { total, user: Number(user._sum.costUsd ?? 0) * usdInrRate() };
}

/** Refusal message when this person may not send another message. */
export async function madmaxCapCheck(userId: string): Promise<string | null> {
  const cap = await madmaxCap();
  if (cap.perUserInr === null && cap.totalInr === null) return null;
  return capBlock(cap, await madmaxSpendInr(userId));
}

/** HR view: this month's MadMax spend per person, highest first. */
export async function madmaxSpendByUser(now = new Date()) {
  const rows = await db.aiUsage.groupBy({
    by: ["userId"],
    where: { ...monthWhere(now), userId: { not: null } },
    _sum: { costUsd: true },
    _count: true,
  });
  const users = await db.user.findMany({
    where: { id: { in: rows.map((row) => row.userId!) } },
    select: { id: true, name: true, email: true },
  });
  const rate = usdInrRate();
  return rows
    .map((row) => {
      const user = users.find((candidate) => candidate.id === row.userId);
      return {
        userId: row.userId!,
        name: user?.name || user?.email || "Unknown",
        requests: row._count,
        spentInr: Number(row._sum.costUsd ?? 0) * rate,
      };
    })
    .sort((left, right) => right.spentInr - left.spentInr);
}
