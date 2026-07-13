import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

// Application-layer encryption for statutory PII (PAN, Aadhaar, bank
// account, IFSC). AES-256-GCM; stored format is `iv:tag:ciphertext` (hex).
// Blind index = HMAC-SHA256 over the normalized value with a separate key,
// used for uniqueness checks and dedupe without decrypting.

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(envVar: "FIELD_ENCRYPTION_KEY" | "BLIND_INDEX_KEY"): Buffer {
  const raw = process.env[envVar];
  if (!raw) {
    throw new Error(`${envVar} is not set`);
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error(`${envVar} must be 32 bytes of hex (64 hex chars)`);
  }
  return key;
}

export function encryptField(plaintext: string): string {
  const key = getKey("FIELD_ENCRYPTION_KEY");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptField(stored: string): string {
  const key = getKey("FIELD_ENCRYPTION_KEY");
  const [ivHex, tagHex, dataHex] = stored.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed encrypted field");
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

/** Normalize before hashing so formatting differences don't defeat dedupe. */
export function normalizeIdentifier(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** Deterministic blind index for uniqueness checks without decryption. */
export function blindIndex(value: string): string {
  const key = getKey("BLIND_INDEX_KEY");
  return createHmac("sha256", key)
    .update(normalizeIdentifier(value))
    .digest("hex");
}

/** Mask a sensitive value for non-privileged display: ••••1234 */
export function maskValue(value: string, visible = 4): string {
  const tail = value.slice(-visible);
  return `••••${tail}`;
}
