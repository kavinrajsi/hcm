import type { IdCardStatus } from "@/generated/prisma/enums";

// Single source for the ID card status dropdown, filter and history labels,
// in workflow order.
export const ID_CARD_STATUSES = [
  ["PHOTO_TAKEN", "Photo Taken"],
  ["ASSIGNED_TO_DESIGNER", "Assigned to Designer"],
  ["PENDING", "Pending"],
  ["ISSUED", "Issued"],
  ["RE_ISSUE", "Re Issue"],
  ["RETURN_PENDING", "Return Pending"],
  ["RETURNED", "Returned"],
] as const satisfies readonly (readonly [IdCardStatus, string])[];

export const ID_CARD_STATUS_VALUES = ID_CARD_STATUSES.map(([v]) => v) as [
  IdCardStatus,
  ...IdCardStatus[],
];

const LABELS: Record<string, string> = Object.fromEntries(ID_CARD_STATUSES);

/** Label for a status; history rows may hold retired values (e.g. CORRECTION). */
export function idCardStatusLabel(status: string): string {
  return LABELS[status] ?? status;
}
