import { describe, expect, it } from "vitest";
import { normalizePhone, vendorSchema } from "./vendors";

describe("normalizePhone", () => {
  it("keeps + and digits, tidies separators", () => {
    expect(normalizePhone("+91 98400-12345")).toBe("+91 98400 12345");
    expect(normalizePhone("044 (2345) 6789")).toBe("044 2345 6789");
    expect(normalizePhone(" 9840012345 ")).toBe("9840012345");
  });
  it("rejects letters and wrong lengths", () => {
    expect(normalizePhone("call me")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("1234567890123456")).toBeNull();
  });
});

describe("vendorSchema", () => {
  const base = { name: "Apple Care T Nagar", kind: "SERVICE", phone: "+91 98400 12345" };

  it("accepts full contact details and normalises them", () => {
    const parsed = vendorSchema.parse({
      ...base,
      contactPerson: "Ravi",
      email: "Service@Example.COM",
      altPhone: "044-2345-6789",
      address: "",
    });
    expect(parsed).toMatchObject({
      email: "service@example.com",
      altPhone: "044 2345 6789",
      address: null,
      contactPerson: "Ravi",
    });
  });

  it("requires a name and a phone number", () => {
    expect(vendorSchema.safeParse({ ...base, name: " " }).success).toBe(false);
    expect(vendorSchema.safeParse({ ...base, phone: "" }).success).toBe(false);
  });

  it("rejects a bad email or alternative phone", () => {
    expect(vendorSchema.safeParse({ ...base, email: "not-an-email" }).error?.issues[0]?.message).toMatch(/email/);
    expect(vendorSchema.safeParse({ ...base, altPhone: "abc" }).error?.issues[0]?.message).toMatch(/Alternative/);
  });

  it("rejects the same number twice", () => {
    expect(vendorSchema.safeParse({ ...base, altPhone: "+91 98400-12345" }).success).toBe(false);
  });
});
