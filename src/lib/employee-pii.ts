import { decryptField, encryptField } from "@/lib/crypto";

// Contact / personal / statutory employee fields stored encrypted in
// `<field>Enc` columns (src/lib/crypto.ts). Writers go through encryptPii,
// readers through readPii. While older rows still hold the plaintext
// columns, readPii falls back to them; scripts/encrypt-pii.ts moves those
// rows, after which the plaintext columns are dropped.

export const PII_FIELDS = [
  "phone",
  "personalEmail",
  "emergencyContact",
  "address",
  "dateOfBirth", // ISO date string (YYYY-MM-DD)
  "pfNumber",
  "uanNumber",
] as const;

export type PiiField = (typeof PII_FIELDS)[number];
export type Pii = Record<PiiField, string | null>;

type EncColumn = `${PiiField}Enc`;

/** Row shape readPii accepts: the Enc columns plus (legacy) plaintext ones. */
export type PiiRow = Partial<Record<EncColumn, string | null>> & {
  phone?: string | null;
  personalEmail?: string | null;
  emergencyContact?: string | null;
  address?: string | null;
  dateOfBirth?: Date | null;
  pfNumber?: string | null;
  uanNumber?: string | null;
};

/** Prisma `select` for everything readPii needs. */
export const PII_SELECT = {
  phone: true,
  personalEmail: true,
  emergencyContact: true,
  address: true,
  dateOfBirth: true,
  pfNumber: true,
  uanNumber: true,
  phoneEnc: true,
  personalEmailEnc: true,
  emergencyContactEnc: true,
  addressEnc: true,
  dateOfBirthEnc: true,
  pfNumberEnc: true,
  uanNumberEnc: true,
} as const;

function legacyValue(row: PiiRow, field: PiiField): string | null {
  const value = row[field];
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value ?? null;
}

/** Decrypted PII for display / editing; server-side only. */
export function readPii(row: PiiRow): Pii {
  const out = {} as Pii;
  for (const field of PII_FIELDS) {
    const enc = row[`${field}Enc`];
    out[field] = enc ? decryptField(enc) : legacyValue(row, field);
  }
  return out;
}

/**
 * Prisma data for the fields present in `input`: encrypted into the Enc
 * column, plaintext column cleared. Fields left undefined are untouched
 * (same "blank keeps the old value" behaviour as before).
 */
export function encryptPii(
  input: Partial<Record<PiiField, string | undefined>>,
): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const field of PII_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    data[`${field}Enc`] = encryptField(value);
    data[field] = null;
  }
  return data;
}
