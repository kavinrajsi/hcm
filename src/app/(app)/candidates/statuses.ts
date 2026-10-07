// Pipeline stages used by the madarth.com career form data (candidates.status).
import { CHIP_TONES } from "@/lib/chip-tones";

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
  New: CHIP_TONES.sky,
  Screening: CHIP_TONES.amber,
  Interview: CHIP_TONES.violet,
  Offer: CHIP_TONES.emerald,
  Freelancer: CHIP_TONES.teal,
  Rejected: CHIP_TONES.rose,
};
