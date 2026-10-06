import type { Candidate, Prisma } from "@/generated/prisma/client";
import type { CandidateDetail } from "./candidate-dialog";
import { CANDIDATE_STATUSES, type CandidateStatus } from "./statuses";
import { formatNoteTime, parseNotes } from "./notes";
import { instantRange } from "@/lib/date-filter";

// Shared by the list view, the board view and the board's "Load more" action.

export const POSITIONS = ["Full Time", "Intern"] as const;
export const BOARD_PAGE_SIZE = 50;
/** `source_url` marker for candidates HR added in this app. */
export const MANUAL_SOURCE = "hcm";

export type CandidateFilters = {
  q?: string;
  /** Any of these positions. */
  position?: string[];
  /** Any of these job roles (exact, case-insensitive). */
  role?: string[];
  /** Preset key from DATE_PRESETS; ignored when from/to are set. */
  created?: string;
  /** Custom range, IST: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" (to is inclusive). */
  from?: string;
  to?: string;
};

/** Non-empty honeypot = bot submission; never shown. */
export const NOT_SPAM: Prisma.CandidateWhereInput = {
  OR: [{ honeypot: null }, { honeypot: "" }],
};

export function candidateWhere(
  filters: CandidateFilters,
): Prisma.CandidateWhereInput[] {
  const and: Prisma.CandidateWhereInput[] = [NOT_SPAM];
  and.push(...searchWhere(filters.q));
  const positions = POSITIONS.filter((candidatePosition) => filters.position?.includes(candidatePosition));
  if (positions.length) and.push({ position: { in: positions } });
  const roles = (filters.role ?? []).map((role) => role.trim()).filter(Boolean);
  if (roles.length)
    and.push({ OR: roles.map((role) => ({ jobRole: { equals: role, mode: "insensitive" as const } })) });
  const created = instantRange({
    preset: filters.created,
    from: filters.from,
    to: filters.to,
  });
  if (created) and.push({ createdAt: created });
  return and;
}

/**
 * Phone-looking input ("+91 99526 67427") matches mobile numbers, which are
 * stored as 10 bare digits. Otherwise every word must match some field, so
 * "rahul manoj" finds first + last name and "rahul copywriter" narrows by role.
 */
function searchWhere(searchQuery?: string): Prisma.CandidateWhereInput[] {
  const query = searchQuery?.trim();
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
  const others = CANDIDATE_STATUSES.filter(
    (candidateStatus) => candidateStatus !== "New",
  );
  return { OR: [{ status: null }, { status: { notIn: others } }] };
}

export function statusOf(value: string | null): CandidateStatus {
  return (
    CANDIDATE_STATUSES.find((candidateStatus) => candidateStatus === value) ??
    "New"
  );
}

export function toCandidateDetail(candidate: Candidate): CandidateDetail {
  return {
    id: String(candidate.id),
    name:
      [candidate.firstName, candidate.lastName].filter(Boolean).join(" ") ||
      "—",
    email: candidate.email,
    mobileNumber: candidate.mobileNumber,
    position: candidate.position,
    jobRole: candidate.jobRole,
    location: candidate.location,
    portfolio: candidate.portfolio?.trim() || null,
    resumeHref: candidate.fileUrl
      ? `/api/files/${candidate.fileUrl.split("/").map(encodeURIComponent).join("/")}`
      : null,
    status: statusOf(candidate.status),
    // Newest first, with IST display time resolved on the server.
    notes: parseNotes(candidate.notes)
      .map((note) => ({ ...note, when: formatNoteTime(note.timestamp) }))
      .reverse(),
    appliedOn: candidate.createdAt.toISOString().slice(0, 10),
    pageUrl: candidate.pageUrl,
    addedManually: candidate.sourceUrl === MANUAL_SOURCE,
    referrer: candidate.referrer,
  };
}
