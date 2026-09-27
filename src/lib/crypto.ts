import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

// Application-layer encryption for employee PII. AES-256-GCM; stored format
// is `k<keyId>:iv:tag:ciphertext` (hex). Values written before key ids
// existed are plain `iv:tag:ciphertext` and belong to key id "1".
// Blind index = HMAC-SHA256 over the normalized value with a separate key,
// used for uniqueness checks and dedupe without decrypting.
//
// Keys (see docs/security/encryption-keys.md for backup + rotation):
//   FIELD_ENCRYPTION_KEY      active key, 32 bytes hex
//   FIELD_ENCRYPTION_KEY_ID   its id (default "1")
//   FIELD_ENCRYPTION_OLD_KEYS decrypt-only keys during rotation: "1:<hex>,…"

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

const LEGACY_KEY_ID = "1";

function parseKey(raw: string, name: string): Buffer {
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error(`${name} must be 32 bytes of hex (64 hex chars)`);
  }
  return key;
}

function getKey(envVar: "FIELD_ENCRYPTION_KEY" | "BLIND_INDEX_KEY"): Buffer {
  const raw = process.env[envVar];
  if (!raw) {
    throw new Error(`${envVar} is not set`);
  }
  return parseKey(raw, envVar);
}

function activeKeyId(): string {
  return process.env.FIELD_ENCRYPTION_KEY_ID?.trim() || LEGACY_KEY_ID;
}

/** Key for an id: the active key, or one listed in FIELD_ENCRYPTION_OLD_KEYS. */
function keyForId(id: string): Buffer {
  if (id === activeKeyId()) return getKey("FIELD_ENCRYPTION_KEY");
  for (const entry of (process.env.FIELD_ENCRYPTION_OLD_KEYS ?? "").split(
    ",",
  )) {
    const [oldId, hex] = entry.trim().split(":");
    if (oldId === id && hex) {
      return parseKey(hex, `FIELD_ENCRYPTION_OLD_KEYS entry ${id}`);
    }
  }
  throw new Error(`No encryption key configured for key id ${id}`);
}

/** Key id a stored value was encrypted with. */
function storedKeyId(stored: string): string {
  const m = stored.match(/^k([^:]+):/);
  return m ? m[1] : LEGACY_KEY_ID;
}

/** True when the value was encrypted with a key other than the active one. */
export function needsReencrypt(stored: string): boolean {
  return storedKeyId(stored) !== activeKeyId();
}

export function encryptField(plaintext: string): string {
  const keyId = activeKeyId();
  const key = keyForId(keyId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `k${keyId}:${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptField(stored: string): string {
  const key = keyForId(storedKeyId(stored));
  const body = stored.replace(/^k[^:]+:/, "");
  const [ivHex, tagHex, dataHex] = body.split(":");
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
