import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ passkey: { deleteMany: vi.fn() } }));
const sessions = vi.hoisted(() => ({ revokeSession: vi.fn(), revokeOtherSessions: vi.fn() }));
vi.mock("@/lib/login-sessions", () => sessions);
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", role: "EMPLOYEE", email: "a@x.com", sessionId: "s-here" })),
  requireSelfOrRole: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/passkeys", () => ({ registerPasskey: vi.fn(), registrationOptions: vi.fn() }));

const { removePasskey, signOutDevice, signOutOtherDevices } = await import("./actions");

beforeEach(() => vi.clearAllMocks());

describe("removePasskey", () => {
  it("only ever deletes the signed-in user's own passkey", async () => {
    const form = new FormData();
    form.set("id", "someone-elses");
    await removePasskey(form);
    expect(db.passkey.deleteMany).toHaveBeenCalledWith({ where: { id: "someone-elses", userId: "u1" } });
  });
});

describe("device sign-out", () => {
  const form = (id: string) => {
    const data = new FormData();
    data.set("id", id);
    return data;
  };

  it("signs out another device, scoped to the signed-in user", async () => {
    await signOutDevice(form("s-other"));
    expect(sessions.revokeSession).toHaveBeenCalledWith("s-other", "u1");
  });

  it("won't sign out this device from the list", async () => {
    await signOutDevice(form("s-here"));
    expect(sessions.revokeSession).not.toHaveBeenCalled();
  });

  it("keeps this device when signing out all others", async () => {
    await signOutOtherDevices();
    expect(sessions.revokeOtherSessions).toHaveBeenCalledWith("u1", "s-here");
  });
});
