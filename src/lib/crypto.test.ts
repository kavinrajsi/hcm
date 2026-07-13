import { beforeAll, describe, expect, it } from "vitest";
import {
  blindIndex,
  decryptField,
  encryptField,
  maskValue,
  normalizeIdentifier,
} from "./crypto";

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = "a".repeat(64);
  process.env.BLIND_INDEX_KEY = "b".repeat(64);
});

describe("encryptField / decryptField", () => {
  it("round-trips a PAN", () => {
    const pan = "ABCDE1234F";
    const stored = encryptField(pan);
    expect(stored).not.toContain(pan);
    expect(stored.split(":")).toHaveLength(3);
    expect(decryptField(stored)).toBe(pan);
  });

  it("produces distinct ciphertexts for the same plaintext (random IV)", () => {
    expect(encryptField("ABCDE1234F")).not.toBe(encryptField("ABCDE1234F"));
  });

  it("rejects tampered ciphertext (GCM auth)", () => {
    const stored = encryptField("1234567890123456");
    const [iv, tag, data] = stored.split(":");
    const flipped = data.slice(0, -1) + (data.endsWith("0") ? "1" : "0");
    expect(() => decryptField(`${iv}:${tag}:${flipped}`)).toThrow();
  });

  it("rejects malformed input", () => {
    expect(() => decryptField("not-encrypted")).toThrow(
      "Malformed encrypted field",
    );
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
