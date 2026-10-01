import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

// Vendor form problems come back under the input they're about, contacts
// included, so the form can show each one inline.

const db = vi.hoisted(() => ({
  vendor: { create: vi.fn(), update: vi.fn() },
  vendorContact: { deleteMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({ requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
}));

const { createVendor, updateVendor } = await import("./actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const vendor = { name: "Apple Care", kind: "SERVICE", phone: "+91 98400 12345" };

beforeEach(() => vi.clearAllMocks());

describe("createVendor", () => {
  it("puts vendor and contact problems under their inputs, all at once", async () => {
    const state = await createVendor(
      {},
      form({
        ...vendor,
        phone: "abc",
        contacts: JSON.stringify([
          { name: "Ravi", email: "ravi@shop.test" },
          { name: "", email: "", phone: "" },
          { name: "", email: "meena@shop.test" },
        ]),
      }),
    );
    expect(state.fieldErrors?.phone?.[0]).toMatch(/7–15 digits/);
    expect(state.fieldErrors?.["contacts.2.name"]).toEqual(["Each contact needs a name"]);
    expect(state.error).toBe("Fix the highlighted fields.");
    expect(db.vendor.create).not.toHaveBeenCalled();
  });

  it("flags a duplicate vendor name on the name field", async () => {
    db.vendor.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "x" }),
    );
    const state = await createVendor({}, form(vendor));
    expect(state.fieldErrors?.name?.[0]).toMatch(/already exists/);
  });

  it("keeps an unreadable contacts list as a form error", async () => {
    const state = await createVendor({}, form({ ...vendor, contacts: "{nope" }));
    expect(state.error).toMatch(/Couldn't read the contacts/);
    expect(state.fieldErrors).toBeUndefined();
  });
});

describe("updateVendor", () => {
  it("reports a bad contact email under that contact's row", async () => {
    const state = await updateVendor(
      {},
      form({ id: "v1", ...vendor, contacts: JSON.stringify([{ name: "A", email: "nope" }]) }),
    );
    expect(state.fieldErrors?.["contacts.0.email"]?.[0]).toMatch(/valid contact email/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
