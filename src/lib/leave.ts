// Pure helpers for the Basecamp leave sync (kept import-free for tests).

export const LEAVE_TYPES = [
  "FULL_DAY",
  "HALF_DAY",
  "LATE_ARRIVAL",
  "EARLY_LOGOUT",
  "WFH",
  "OTHER",
] as const;

export type LeaveTypeValue = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type LeaveStatusValue = (typeof LEAVE_STATUSES)[number];
export const LEAVE_STATUS_LABELS: Record<LeaveStatusValue, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};
export const LEAVE_STATUS_CLASSES: Record<LeaveStatusValue, string> = {
  PENDING:
    "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  APPROVED:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  REJECTED: "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200",
};

export const LEAVE_TYPE_LABELS: Record<LeaveTypeValue, string> = {
  FULL_DAY: "Full day",
  HALF_DAY: "Half day",
  LATE_ARRIVAL: "Late arrival",
  EARLY_LOGOUT: "Early logout",
  WFH: "WFH",
  OTHER: "Other",
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/** Basecamp rich text → plain text. Drops @mention/attachment tags. */
export function htmlToText(html: string): string {
  return html
    .replace(/<bc-attachment[\s\S]*?<\/bc-attachment>/gi, "")
    .replace(/<bc-attachment[^>]*\/?>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(
      /&(amp|lt|gt|quot|#39|nbsp);/g,
      (entity) => ENTITIES[entity] ?? entity,
    )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Builds a lowercase email → employee id lookup over work + personal emails. */
export function buildEmailIndex(
  employees: {
    id: string;
    workEmail: string;
    personalEmail: string | null;
  }[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const employee of employees) {
    // Work email wins if someone's personal email collides with another's work email.
    if (employee.personalEmail)
      index.set(employee.personalEmail.toLowerCase(), employee.id);
  }
  for (const employee of employees)
    index.set(employee.workEmail.toLowerCase(), employee.id);
  return index;
}

/** Extracts the rel="next" URL from a Basecamp `Link` header. */
export function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

type DateRange = { gte: Date; lt: Date };

/**
 * Where-fragments for the "Most leave days" leaderboard on /leave, mirroring the page's
 * filters so the chips update with them: name search (`q`, same fields as the list),
 * type, status, and the day/month/year range (default: `yearStart` onward). Returns
 * null when the type filter can't produce full/half-day totals per employee
 * (UNCLASSIFIED / UNMATCHED / a non-day type) — the page hides the chips then.
 * Plain objects so this file stays import-free; the page ANDs them with its scope.
 */
export function leaveTotalsConditions({
  q: searchQuery,
  type,
  status,
  range,
  yearStart,
}: {
  q?: string;
  type?: string;
  status?: LeaveStatusValue;
  range?: DateRange;
  yearStart: Date;
}): Record<string, unknown>[] | null {
  const dayTypes = ["FULL_DAY", "HALF_DAY"];
  if (type && !dayTypes.includes(type)) return null;
  const conditions: Record<string, unknown>[] = [
    { employeeId: { not: null } },
    { type: type ? type : { in: dayTypes } },
    status ? { status } : { status: { not: "REJECTED" } },
    range
      ? { OR: [{ startDate: range }, { startDate: null, postedOn: range }] }
      : { startDate: { gte: yearStart } },
  ];
  if (searchQuery) {
    conditions.push({
      OR: [
        { creatorName: { contains: searchQuery, mode: "insensitive" } },
        { employee: { name: { contains: searchQuery, mode: "insensitive" } } },
        { message: { contains: searchQuery, mode: "insensitive" } },
      ],
    });
  }
  return conditions;
}

/** "in 2026", "in March 2026", "on 12 Mar 2026" — the period the leaderboard covers. */
export function leaveTotalsPeriod(
  { day, month, year }: { day?: number; month?: number; year?: number },
  now: Date = new Date(),
): string {
  const resolvedYear = year ?? now.getUTCFullYear();
  if (!day && !month) return `in ${resolvedYear}`;
  const resolvedMonth = month ?? now.getUTCMonth() + 1;
  const date = new Date(Date.UTC(resolvedYear, resolvedMonth - 1, day ?? 1));
  if (!day) {
    return `in ${date.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}`;
  }
  return `on ${date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
}
