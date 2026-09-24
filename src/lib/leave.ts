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
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Builds a lowercase email → employee id lookup over work + personal emails. */
export function buildEmailIndex(
  employees: { id: string; workEmail: string; personalEmail: string }[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const e of employees) {
    // Work email wins if someone's personal email collides with another's work email.
    if (e.personalEmail) index.set(e.personalEmail.toLowerCase(), e.id);
  }
  for (const e of employees) index.set(e.workEmail.toLowerCase(), e.id);
  return index;
}

/** Extracts the rel="next" URL from a Basecamp `Link` header. */
export function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}
