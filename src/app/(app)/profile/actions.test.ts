import { beforeEach, describe, expect, it, vi } from "vitest";

// Profile forms get their problems back under the input they're about.

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));
const saveContact = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", email: "me@x.com" })),
  requireSelfOrRole: vi.fn(async () => ({ id: "u1" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/hcm-ops", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hcm-ops")>()),
  saveContact,
}));

const { changePassword, updateAccountName, updateOwnContact } = await import("./actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("updateAccountName", () => {
  it("flags an empty name on the name field", async () => {
    const state = await updateAccountName({}, form({ name: "  " }));
    expect(state.fieldErrors?.name).toEqual(["Name is required"]);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("changePassword", () => {
  it("puts a mismatch under the confirm field", async () => {
    const state = await changePassword(
      {},
      form({ newPassword: "longenough", confirmPassword: "different1" }),
    );
    expect(state.fieldErrors?.confirmPassword).toEqual(["Passwords do not match"]);
  });

  it("asks for the current password on that field", async () => {
    db.user.findUnique.mockResolvedValue({ passwordHash: "hash" });
    const state = await changePassword(
      {},
      form({ newPassword: "longenough", confirmPassword: "longenough" }),
    );
    expect(state.fieldErrors?.currentPassword).toEqual(["Current password is required"]);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("updateOwnContact", () => {
  it("flags a bad personal email on that field", async () => {
    const state = await updateOwnContact(
      "e1",
      {},
      form({ phone: "9840012345", personalEmail: "nope" }),
    );
    expect(state.fieldErrors?.personalEmail?.[0]).toMatch(/personal email/);
    expect(saveContact).not.toHaveBeenCalled();
  });

  it("passes the father's name through with the rest", async () => {
    const state = await updateOwnContact(
      "e1",
      {},
      form({ phone: "9840012345", personalEmail: "me@home.test", fatherName: " Raman ", address: "1 Main St" }),
    );
    expect(state).toEqual({ ok: true });
    expect(saveContact).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({ fatherName: "Raman", address: "1 Main St" }),
    );
  });
});
