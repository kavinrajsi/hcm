// Coloured count chips (the row of "Label count" chips above a list), so a
// status reads at a glance. One palette for every page: the Candidates
// pipeline set the look. Each tone pairs a light and a dark variant.

export const CHIP_TONES = {
  sky: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  violet: "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200",
  emerald: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  teal: "bg-teal-100 text-teal-900 dark:bg-teal-500/20 dark:text-teal-200",
  orange: "bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200",
  rose: "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200",
  zinc: "bg-zinc-200 text-zinc-800 dark:bg-zinc-500/20 dark:text-zinc-300",
} as const;

/** Employment type: Employees, Onboarding, Exit. */
export const EMP_TYPE_CHIPS: Record<string, string> = {
  INTERN: CHIP_TONES.sky,
  PROBATION: CHIP_TONES.amber,
  CONTRACT: CHIP_TONES.violet,
  PERMANENT: CHIP_TONES.emerald,
};

/** Probation status. */
export const PROBATION_CHIPS: Record<string, string> = {
  PENDING: CHIP_TONES.amber,
  CONFIRMED: CHIP_TONES.emerald,
  EXTENDED: CHIP_TONES.violet,
  EXITED: CHIP_TONES.zinc,
};

/** ID card status, in the order a card moves through. */
export const ID_CARD_CHIPS: Record<string, string> = {
  PHOTO_TAKEN: CHIP_TONES.sky,
  ASSIGNED_TO_DESIGNER: CHIP_TONES.violet,
  PENDING: CHIP_TONES.amber,
  ISSUED: CHIP_TONES.emerald,
  RE_ISSUE: CHIP_TONES.orange,
  RETURN_PENDING: CHIP_TONES.rose,
  RETURNED: CHIP_TONES.zinc,
};

/** Device status, plus the "Rented" ownership chip. */
export const DEVICE_CHIPS: Record<string, string> = {
  IN_STOCK: CHIP_TONES.sky,
  ASSIGNED: CHIP_TONES.emerald,
  IN_SERVICE: CHIP_TONES.amber,
  RETIRED: CHIP_TONES.zinc,
  LOST: CHIP_TONES.rose,
  RENTED: CHIP_TONES.teal,
};

/** Email log delivery. */
export const EMAIL_STATUS_CHIPS: Record<string, string> = {
  SENT: CHIP_TONES.sky,
  OPENED: CHIP_TONES.emerald,
  BOUNCED: CHIP_TONES.orange,
  FAILED: CHIP_TONES.rose,
  NOT_SENT: CHIP_TONES.zinc,
};
