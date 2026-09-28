import { createCipheriv, randomBytes } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  blindIndex,
  decryptField,
  encryptField,
  maskValue,
  needsReencrypt,
  normalizeIdentifier,
} from "./crypto";

const KEY_1 = "a".repeat(64);
const KEY_2 = "c".repeat(64);

function useKeys(active: string, id?: string, old?: string) {
  process.env.FIELD_ENCRYPTION_KEY = active;
  if (id) process.env.FIELD_ENCRYPTION_KEY_ID = id;
  else delete process.env.FIELD_ENCRYPTION_KEY_ID;
  if (old) process.env.FIELD_ENCRYPTION_OLD_KEYS = old;
  else delete process.env.FIELD_ENCRYPTION_OLD_KEYS;
}

/** A value in the pre-key-id format (`iv:tag:ciphertext`). */
function legacyEncrypt(plaintext: string, keyHex: string): string {
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(keyHex, "hex"),
    initializationVector,
  );
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return `${initializationVector.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`;
}

beforeAll(() => {
  useKeys(KEY_1);
  process.env.BLIND_INDEX_KEY = "b".repeat(64);
});

afterEach(() => useKeys(KEY_1));

describe("encryptField / decryptField", () => {
  it("round-trips a PAN", () => {
    const pan = "ABCDE1234F";
    const stored = encryptField(pan);
    expect(stored).not.toContain(pan);
    expect(stored.startsWith("k1:")).toBe(true);
    expect(stored.split(":")).toHaveLength(4);
    expect(decryptField(stored)).toBe(pan);
  });

  it("produces distinct ciphertexts for the same plaintext (random IV)", () => {
    expect(encryptField("ABCDE1234F")).not.toBe(encryptField("ABCDE1234F"));
  });

  it("rejects tampered ciphertext (GCM auth)", () => {
    const stored = encryptField("1234567890123456");
    const [id, ivPart, tag, data] = stored.split(":");
    const flipped = data.slice(0, -1) + (data.endsWith("0") ? "1" : "0");
    expect(() => decryptField(`${id}:${ivPart}:${tag}:${flipped}`)).toThrow();
  });

  it("rejects malformed input", () => {
    expect(() => decryptField("not-encrypted")).toThrow(
      "Malformed encrypted field",
    );
  });
});

describe("key ids and rotation", () => {
  it("decrypts values written before key ids existed (key 1)", () => {
    expect(decryptField(legacyEncrypt("ABCDE1234F", KEY_1))).toBe("ABCDE1234F");
  });

  it("reads old values after rotation and flags them for re-encryption", () => {
    const legacy = legacyEncrypt("ABCDE1234F", KEY_1);
    const v1 = encryptField("123412341234");
    expect(needsReencrypt(v1)).toBe(false);

    useKeys(KEY_2, "2", `1:${KEY_1}`);
    expect(decryptField(legacy)).toBe("ABCDE1234F");
    expect(decryptField(v1)).toBe("123412341234");
    expect(needsReencrypt(v1)).toBe(true);
    expect(needsReencrypt(legacy)).toBe(true);

    const v2 = encryptField(decryptField(v1));
    expect(v2.startsWith("k2:")).toBe(true);
    expect(needsReencrypt(v2)).toBe(false);
    expect(decryptField(v2)).toBe("123412341234");
  });

  it("refuses values whose key is no longer configured", () => {
    const v1 = encryptField("secret");
    useKeys(KEY_2, "2");
    expect(() => decryptField(v1)).toThrow("No encryption key configured");
  });
});

describe("blindIndex", () => {
  it("is deterministic", () => {
    expect(blindIndex("ABCDE1234F")).toBe(blindIndex("ABCDE1234F"));
  });

  it("normalizes case, spaces, and dashes", () => {
    expect(blindIndex("abcde 1234-f")).toBe(blindIndex("ABCDE1234F"));
  });

  it("differs for different values", () => {
    expect(blindIndex("ABCDE1234F")).not.toBe(blindIndex("ABCDE1234G"));
    // Aadhaar-style numerics
    expect(blindIndex("123412341234")).not.toBe(blindIndex("123412341235"));
  });
});

describe("helpers", () => {
  it("normalizeIdentifier strips separators and uppercases", () => {
    expect(normalizeIdentifier(" ab-cd 12 ")).toBe("ABCD12");
  });

  it("maskValue shows only the tail", () => {
    expect(maskValue("123456789012")).toBe("••••9012");
  });
});
