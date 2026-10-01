import { describe, expect, it } from "vitest";
import { z } from "zod";
import { collectInvalid, messageFor, type CheckableControl } from "./validation";
import { fieldError, invalid } from "@/lib/form-state";

const valid = { valueMissing: false, typeMismatch: false, patternMismatch: false, tooShort: false, tooLong: false, rangeUnderflow: false, rangeOverflow: false, stepMismatch: false, badInput: false, valid: true };
const control = (name: string, validity: Partial<typeof valid>, extra: Partial<CheckableControl> = {}): CheckableControl => ({
  name,
  willValidate: true,
  validity: { ...valid, ...validity, valid: false },
  ...extra,
});

describe("inline messages for browser checks", () => {
  it("words each kind of problem", () => {
    expect(messageFor(control("a", { valueMissing: true }))).toBe("Required");
    expect(messageFor(control("a", { typeMismatch: true }, { type: "email" }))).toBe("Enter a valid email");
    expect(messageFor(control("a", { rangeUnderflow: true }, { min: "1" }))).toBe("Must be at least 1");
    expect(messageFor(control("a", { tooShort: true }, { minLength: 8 }))).toBe("At least 8 characters");
    expect(messageFor(control("a", { patternMismatch: true }, { title: "YYYY-MM-DD" }))).toBe("YYYY-MM-DD");
  });

  it("collects invalid named fields in order, once per name", () => {
    const errors = collectInvalid([
      control("brand", { valueMissing: true }),
      { name: "ok", willValidate: true, validity: valid },
      control("email", { typeMismatch: true }, { type: "email" }),
      control("email", { valueMissing: true }),
      { ...control("", { valueMissing: true }) },
      { ...control("hidden", { valueMissing: true }), willValidate: false },
    ]);
    expect(errors).toEqual({ brand: ["Required"], email: ["Enter a valid email"] });
    expect(Object.keys(errors)).toEqual(["brand", "email"]);
  });
});

describe("server field errors", () => {
  it("keeps every field's message, with dotted paths for nested inputs", () => {
    const schema = z.object({
      name: z.string().min(1, "Vendor name is required"),
      contacts: z.array(z.object({ email: z.email("Enter a valid contact email") })),
    });
    const result = schema.safeParse({ name: "", contacts: [{ email: "a@b.co" }, { email: "nope" }] });
    expect(result.success).toBe(false);
    expect(invalid(result.error!)).toEqual({
      error: "Fix the highlighted fields.",
      fieldErrors: { name: ["Vendor name is required"], "contacts.1.email": ["Enter a valid contact email"] },
    });
  });

  it("puts form-wide problems in error", () => {
    const schema = z.object({ a: z.string(), b: z.string() }).refine((v) => v.a === v.b, "They must match");
    const result = schema.safeParse({ a: "x", b: "y" });
    expect(invalid(result.error!)).toEqual({ error: "They must match", fieldErrors: {} });
  });

  it("makes a single field error", () => {
    expect(fieldError("serialNumber", "Already used")).toEqual({
      error: "Fix the highlighted fields.",
      fieldErrors: { serialNumber: ["Already used"] },
    });
  });
});
