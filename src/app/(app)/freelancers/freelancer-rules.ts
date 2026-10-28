import { z } from "zod";
import { cleanNoteHtml, plainNoteText } from "@/app/(app)/candidates/note-html";

// Rules for a freelancer's fields. Shared by the add form (browser checks,
// via the limits and pattern below), the server actions and CSV import, so a
// row that passes one passes all three.

export const FREELANCER_LIMITS = {
  name: 100,
  phone: 25,
  email: 254,
  skillset: 200,
  rate: 50,
  profileUrl: 500,
  note: 5000,
} as const;

/** Browser check for the phone field; the server also counts the digits. */
export const PHONE_PATTERN = "[+]?[0-9 ()-]{7,25}";
export const PHONE_TITLE = "Use digits only, with an optional + and spaces, 7 to 15 digits";

const hasLetter = (value: string) => /\p{L}/u.test(value);
const digitCount = (value: string) => value.replace(/\D/g, "").length;

/** Only http(s) addresses with a real domain, e.g. behance.net/name. */
export function isWebAddress(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** "behance.net/meena" becomes "https://behance.net/meena". */
export function withHttps(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

const required = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long (${max} characters at most)`);

export const freelancerSchema = z.object({
  name: required("Name", FREELANCER_LIMITS.name).refine(hasLetter, "Name must contain letters"),
  email: required("Email", FREELANCER_LIMITS.email).email("Enter a valid email"),
  phone: required("Phone number", FREELANCER_LIMITS.phone)
    .regex(/^\+?[0-9 ()-]+$/, PHONE_TITLE)
    .refine((value) => digitCount(value) >= 7 && digitCount(value) <= 15, PHONE_TITLE),
  skillset: required("Skill set", FREELANCER_LIMITS.skillset).refine(
    hasLetter,
    "Skill set must name at least one skill",
  ),
  profileUrl: z
    .string()
    .trim()
    .min(1, "Profile URL is required")
    .max(FREELANCER_LIMITS.profileUrl, `Profile URL is too long (${FREELANCER_LIMITS.profileUrl} characters at most)`)
    .transform(withHttps)
    .refine(isWebAddress, "Profile URL must be a web address, e.g. behance.net/name"),
  rate: required("Rate", FREELANCER_LIMITS.rate).refine(
    (value) => /\d/.test(value),
    "Rate needs an amount, e.g. ₹2500/day",
  ),
  availability: z.enum(["AVAILABLE", "BUSY", "UNAVAILABLE", "UNKNOWN"], {
    error: "Pick a status",
  }),
  notes: z
    .string()
    .transform(cleanNoteHtml)
    .refine((html) => plainNoteText(html) !== "", "Note is required")
    .refine(
      (html) => plainNoteText(html).length <= FREELANCER_LIMITS.note,
      `Note is too long (${FREELANCER_LIMITS.note} characters at most)`,
    ),
});

// Rate: an amount and what it is paid per. The form asks for them apart and
// stores them as one value, "₹2500/day", with the ₹ added automatically.
export const RATE_UNITS = [
  { value: "day", label: "Day" },
  { value: "hour", label: "Hour" },
  { value: "reel", label: "Reel" },
  { value: "video", label: "Video" },
  { value: "project", label: "Project" },
  { value: "other", label: "Other" },
] as const;

export const rateFormSchema = z
  .object({
    rateAmount: z
      .string()
      .trim()
      .min(1, "Enter the rate amount")
      .regex(/^\d{1,9}(\.\d{1,2})?$/, "Numbers only, e.g. 2500"),
    rateUnit: z.enum(
      RATE_UNITS.map((unit) => unit.value),
      { error: "Pick what the rate is per" },
    ),
    rateOtherUnit: z.string().trim().max(20, "At most 20 characters").default(""),
  })
  .superRefine((value, ctx) => {
    if (value.rateUnit !== "other") return;
    if (!value.rateOtherUnit) {
      ctx.addIssue({ code: "custom", path: ["rateOtherUnit"], message: "Enter the unit, e.g. shoot" });
    } else if (!/^[\p{L} -]+$/u.test(value.rateOtherUnit)) {
      ctx.addIssue({ code: "custom", path: ["rateOtherUnit"], message: "Use letters only, e.g. shoot" });
    }
  });

/** "₹2500/day" from the parsed rate fields. */
export function rateFrom(value: z.infer<typeof rateFormSchema>): string {
  const unit = value.rateUnit === "other" ? value.rateOtherUnit.toLowerCase() : value.rateUnit;
  return `₹${value.rateAmount}/${unit}`;
}

/** Reads a CSV rate such as "2500/day" or "₹2500/reel"; null if it isn't one. */
export function rateFromText(raw: string): string | null {
  const match = /^₹?\s*(\d{1,9}(?:\.\d{1,2})?)\s*\/\s*([\p{L} -]{1,20})$/u.exec(raw.trim());
  return match ? `₹${match[1]}/${match[2].trim().toLowerCase()}` : null;
}

