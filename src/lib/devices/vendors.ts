import { z } from "zod";
import type { VendorKind } from "@/generated/prisma/enums";

// Device vendors: who sells devices, who repairs them, and how to reach them.

export const VENDOR_KINDS = ["SALES", "SERVICE", "BOTH"] as const;

export const VENDOR_KIND_LABELS: Record<VendorKind, string> = {
  SALES: "Sells devices",
  SERVICE: "Services devices",
  BOTH: "Sells & services",
};

/** Vendors to offer when recording a purchase / a service trip. */
export const SALES_KINDS: VendorKind[] = ["SALES", "BOTH"];
export const SERVICE_KINDS: VendorKind[] = ["SERVICE", "BOTH"];

/**
 * Tidies a phone number for storage: keeps a leading +, digits, and single
 * spaces. Returns null when it doesn't have 7–15 digits.
 */
export function normalizePhone(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\+?[\d\s\-().]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/^\+/, "").replace(/[-().]/g, " ").replace(/\s+/g, " ").trim();
}

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const phone = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform((value, ctx) => {
      const normalized = normalizePhone(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: `${label} must be 7–15 digits, e.g. +91 98400 12345` });
        return z.NEVER;
      }
      return normalized;
    });

export const vendorSchema = z
  .object({
    name: z.string().trim().min(2, "Vendor name is required"),
    kind: z.enum(VENDOR_KINDS),
    email: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value.toLowerCase()))
      .nullable()
      .optional()
      .transform((value) => value ?? null)
      .refine((value) => value === null || z.email().safeParse(value).success, "Enter a valid email address"),
    phone: phone("Phone number"),
    altPhone: z
      .string()
      .trim()
      .optional()
      .transform((value, ctx) => {
        if (!value) return null;
        const normalized = normalizePhone(value);
        if (!normalized) {
          ctx.addIssue({ code: "custom", message: "Alternative phone must be 7–15 digits" });
          return z.NEVER;
        }
        return normalized;
      }),
    address: optionalText,
    notes: optionalText,
  })
  .refine((vendor) => !vendor.altPhone || vendor.altPhone !== vendor.phone, {
    message: "Alternative phone is the same as the phone number",
    path: ["altPhone"],
  });

export type VendorInput = z.infer<typeof vendorSchema>;

// --- Contact people ---

const optionalPhone = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      const normalized = normalizePhone(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: `${label} must be 7–15 digits` });
        return z.NEVER;
      }
      return normalized;
    });

export const contactSchema = z.object({
  name: z.string().default("").pipe(z.string().trim().min(1, "Each contact needs a name").max(120)),
  role: optionalText,
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value.toLowerCase() : null))
    .refine((value) => value === null || z.email().safeParse(value).success, "Enter a valid contact email"),
  phone: optionalPhone("Contact phone"),
  altPhone: optionalPhone("Contact alternative phone"),
  isPrimary: z.boolean().optional().default(false),
});

export type ContactInput = z.infer<typeof contactSchema>;

/**
 * Contacts posted as JSON from the vendor form. Blank rows are dropped;
 * exactly one is primary when there are any (the first, if none is marked).
 * Problems come back per field, keyed by the row's position in the posted
 * list (blank rows included), e.g. "contacts.1.email".
 */
export function parseContacts(
  json: unknown,
):
  | { ok: true; contacts: (ContactInput & { position: number })[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> } {
  let raw: unknown = [];
  if (typeof json === "string" && json.trim()) {
    try {
      raw = JSON.parse(json);
    } catch {
      return { ok: false, error: "Couldn't read the contacts" };
    }
  }
  if (!Array.isArray(raw)) return { ok: false, error: "Couldn't read the contacts" };
  const rows = raw
    .map((row: unknown, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        row &&
        typeof row === "object" &&
        ["name", "role", "email", "phone", "altPhone"].some(
          (key) => typeof (row as Record<string, unknown>)[key] === "string" && ((row as Record<string, string>)[key]).trim(),
        ),
    );
  if (rows.length > 20) return { ok: false, error: "Up to 20 contacts per vendor" };
  const contacts: (ContactInput & { position: number })[] = [];
  const fieldErrors: Record<string, string[]> = {};
  let firstError: string | undefined;
  for (const { row, index } of rows) {
    const parsed = contactSchema.safeParse(row);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        firstError ??= issue.message;
        const key = ["contacts", index, ...issue.path].map(String).join(".");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      continue;
    }
    contacts.push({ ...parsed.data, position: contacts.length });
  }
  if (firstError) return { ok: false, error: firstError, fieldErrors };
  const primary = contacts.findIndex((contact) => contact.isPrimary);
  contacts.forEach((contact, index) => {
    contact.isPrimary = index === (primary === -1 ? 0 : primary);
  });
  return { ok: true, contacts };
}
