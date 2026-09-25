import type { Candidate, Prisma } from "@/generated/prisma/client";
import type { CandidateDetail } from "./candidate-dialog";
import { CANDIDATE_STATUSES, type CandidateStatus } from "./statuses";
import { formatNoteTime, parseNotes } from "./notes";

// Shared by the list view, the board view and the board's "Load more" action.

export const POSITIONS = ["Full Time", "Intern"] as const;
export const BOARD_PAGE_SIZE = 50;
/** `source_url` marker for candidates HR added in this app. */
export const MANUAL_SOURCE = "hcm";

export type CandidateFilters = {
  q?: string;
  position?: string;
};

/** Non-empty honeypot = bot submission; never shown. */
export const NOT_SPAM: Prisma.CandidateWhereInput = {
  OR: [{ honeypot: null }, { honeypot: "" }],
};

export function candidateWhere(
  f: CandidateFilters,
): Prisma.CandidateWhereInput[] {
  const and: Prisma.CandidateWhereInput[] = [NOT_SPAM];
  and.push(...searchWhere(f.q));
  const position = POSITIONS.find((p) => p === f.position);
  if (position) and.push({ position });
  return and;
}

/**
 * Phone-looking input ("+91 99526 67427") matches mobile numbers, which are
 * stored as 10 bare digits. Otherwise every word must match some field, so
 * "rahul manoj" finds first + last name and "rahul copywriter" narrows by role.
 */
function searchWhere(q?: string): Prisma.CandidateWhereInput[] {
  const query = q?.trim();
  if (!query) return [];
  if (/^[\d\s+()-]+$/.test(query)) {
    const digits = query.replace(/\D/g, "").slice(-10);
    if (digits) return [{ mobileNumber: { contains: digits } }];
  }
  return query.split(/\s+/).map((word) => ({
    OR: [
      { firstName: { contains: word, mode: "insensitive" } },
      { lastName: { contains: word, mode: "insensitive" } },
      { email: { contains: word, mode: "insensitive" } },
      { jobRole: { contains: word, mode: "insensitive" } },
      { location: { contains: word, mode: "insensitive" } },
    ],
  }));
}

/** Null or unrecognised statuses are shown as New (matches statusOf). */
export function statusWhere(
  status: CandidateStatus,
): Prisma.CandidateWhereInput {
  if (status !== "New") return { status };
  const others = CANDIDATE_STATUSES.filter((s) => s !== "New");
  return { OR: [{ status: null }, { status: { notIn: others } }] };
}

export function statusOf(value: string | null): CandidateStatus {
  return CANDIDATE_STATUSES.find((s) => s === value) ?? "New";
}

export function toCandidateDetail(c: Candidate): CandidateDetail {
  return {
    id: String(c.id),
    name: [c.firstName, c.lastName].filter(Boolean).join(" ") || "—",
    email: c.email,
    mobileNumber: c.mobileNumber,
    position: c.position,
    jobRole: c.jobRole,
    location: c.location,
    portfolio: c.portfolio?.trim() || null,
    resumeHref: c.fileUrl
      ? `/api/files/${c.fileUrl.split("/").map(encodeURIComponent).join("/")}`
      : null,
    status: statusOf(c.status),
    // Newest first, with IST display time resolved on the server.
    notes: parseNotes(c.notes)
      .map((n) => ({ ...n, when: formatNoteTime(n.timestamp) }))
      .reverse(),
    appliedOn: c.createdAt.toISOString().slice(0, 10),
    pageUrl: c.pageUrl,
    addedManually: c.sourceUrl === MANUAL_SOURCE,
    referrer: c.referrer,
  };
}
