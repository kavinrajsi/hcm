import { describe, expect, it } from "vitest";
import { normalizePhone, parseContacts, vendorSchema } from "./vendors";

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
      email: "Service@Example.COM",
      altPhone: "044-2345-6789",
      address: "",
    });
    expect(parsed).toMatchObject({
      email: "service@example.com",
      altPhone: "044 2345 6789",
      address: null,
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

describe("parseContacts", () => {
  it("reads several contacts, tidies them, and keeps exactly one primary", () => {
    const result = parseContacts(
      JSON.stringify([
        { name: "Ravi", role: "Sales", email: "Ravi@Shop.TEST", phone: "98400-12345" },
        { name: "Meena", role: "Service", phone: "+91 90000 00002", isPrimary: true },
        { name: "", role: "", email: "", phone: "" },
      ]),
    );
    expect(result).toEqual({
      ok: true,
      contacts: [
        { name: "Ravi", role: "Sales", email: "ravi@shop.test", phone: "98400 12345", altPhone: null, isPrimary: false, position: 0 },
        { name: "Meena", role: "Service", email: null, phone: "+91 90000 00002", altPhone: null, isPrimary: true, position: 1 },
      ],
    });
  });

  it("makes the first contact primary when none is marked, and only one when several are", () => {
    const none = parseContacts(JSON.stringify([{ name: "A" }, { name: "B" }]));
    expect(none.ok && none.contacts.map((contact) => contact.isPrimary)).toEqual([true, false]);
    const both = parseContacts(JSON.stringify([{ name: "A", isPrimary: true }, { name: "B", isPrimary: true }]));
    expect(both.ok && both.contacts.map((contact) => contact.isPrimary)).toEqual([true, false]);
  });

  it("allows no contacts", () => {
    expect(parseContacts("")).toEqual({ ok: true, contacts: [] });
    expect(parseContacts("[]")).toEqual({ ok: true, contacts: [] });
  });

  it("reports a contact without a name or with a bad email or phone", () => {
    expect(parseContacts(JSON.stringify([{ role: "Sales", phone: "9840012345" }]))).toEqual({
      ok: false,
      error: "Each contact needs a name",
    });
    expect(parseContacts(JSON.stringify([{ name: "A", email: "nope" }]))).toMatchObject({ ok: false });
    expect(parseContacts(JSON.stringify([{ name: "A", phone: "123" }]))).toMatchObject({ ok: false });
    expect(parseContacts("{not json")).toMatchObject({ ok: false });
  });
});
