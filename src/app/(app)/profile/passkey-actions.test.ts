import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ passkey: { deleteMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", role: "EMPLOYEE", email: "a@x.com" })),
  requireSelfOrRole: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/passkeys", () => ({ registerPasskey: vi.fn(), registrationOptions: vi.fn() }));

const { removePasskey } = await import("./actions");

beforeEach(() => vi.clearAllMocks());

describe("removePasskey", () => {
  it("only ever deletes the signed-in user's own passkey", async () => {
    const form = new FormData();
    form.set("id", "someone-elses");
    await removePasskey(form);
    expect(db.passkey.deleteMany).toHaveBeenCalledWith({ where: { id: "someone-elses", userId: "u1" } });
  });
});
