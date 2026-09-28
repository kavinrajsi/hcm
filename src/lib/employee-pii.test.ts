import { beforeAll, describe, expect, it } from "vitest";
import { encryptPii, PII_FIELDS, readPii, type PiiRow } from "./employee-pii";

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = "a".repeat(64);
  delete process.env.FIELD_ENCRYPTION_KEY_ID;
  delete process.env.FIELD_ENCRYPTION_OLD_KEYS;
});

describe("encryptPii", () => {
  it("encrypts provided fields and clears their plaintext columns", () => {
    const data = encryptPii({ phone: "9876543210", dateOfBirth: "1990-05-01" });
    expect(data.phone).toBeNull();
    expect(data.dateOfBirth).toBeNull();
    expect(data.phoneEnc).toMatch(/^k1:/);
    expect(data.phoneEnc).not.toContain("9876543210");
    expect(data.dateOfBirthEnc).toMatch(/^k1:/);
  });

  it("leaves fields that weren't provided untouched", () => {
    const data = encryptPii({ phone: "123" });
    expect(Object.keys(data).sort()).toEqual(["phone", "phoneEnc"]);
  });
});

describe("readPii", () => {
  it("round-trips every field", () => {
    const input = {
      phone: "9876543210",
      personalEmail: "a@b.com",
      emergencyContact: "Mom 99999",
      address: "1 Main St",
      dateOfBirth: "1990-05-01",
      pfNumber: "PF123",
      uanNumber: "UAN456",
    };
    const row = encryptPii(input) as PiiRow;
    expect(readPii(row)).toEqual(input);
  });

  it("falls back to legacy plaintext columns (DOB as Date)", () => {
    const row: PiiRow = {
      phone: "111",
      dateOfBirth: new Date("1985-12-31T00:00:00.000Z"),
    };
    const pii = readPii(row);
    expect(pii.phone).toBe("111");
    expect(pii.dateOfBirth).toBe("1985-12-31");
    expect(pii.address).toBeNull();
  });

  it("prefers the encrypted column over stale plaintext", () => {
    const row = {
      ...encryptPii({ phone: "new" }),
      phone: "old",
    } as PiiRow;
    expect(readPii(row).phone).toBe("new");
  });

  it("returns null for every field of an empty row", () => {
    const pii = readPii({});
    for (const field of PII_FIELDS) expect(pii[field]).toBeNull();
  });
});
