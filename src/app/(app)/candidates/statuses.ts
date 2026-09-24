// Pipeline stages used by the madarth.com career form data (candidates.status).
export const CANDIDATE_STATUSES = [
  "New",
  "Screening",
  "Interview",
  "Offer",
  "Freelancer",
  "Rejected",
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const CANDIDATE_STATUS_CLASSES: Record<CandidateStatus, string> = {
  New: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200",
  Screening:
    "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  Interview:
    "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200",
  Offer:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  Freelancer:
    "bg-teal-100 text-teal-900 dark:bg-teal-500/20 dark:text-teal-200",
  Rejected: "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200",
};
