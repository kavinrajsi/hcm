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
  if (f.q) {
    and.push({
      OR: [
        { firstName: { contains: f.q, mode: "insensitive" } },
        { lastName: { contains: f.q, mode: "insensitive" } },
        { email: { contains: f.q, mode: "insensitive" } },
        { jobRole: { contains: f.q, mode: "insensitive" } },
        { location: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }
  const position = POSITIONS.find((p) => p === f.position);
  if (position) and.push({ position });
  return and;
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
