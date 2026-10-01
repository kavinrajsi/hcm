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
    contactPerson: optionalText,
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
