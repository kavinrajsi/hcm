import { beforeEach, describe, expect, it, vi } from "vitest";

// Page guards: a wrong role renders the 403 page instead of throwing.

const navigation = vi.hoisted(() => ({
  forbidden: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;403");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT;${url}`);
  }),
}));
const auth = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  employee: { findUnique: vi.fn() },
}));

vi.mock("next/navigation", () => navigation);
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ db }));

const rbac = await import("./rbac");

const signedInAs = (role: string) => {
  auth.mockResolvedValue({ user: { id: "u1" } });
  db.user.findUnique.mockResolvedValue({ id: "u1", role, email: "a@x.com", disabledAt: null });
};

beforeEach(() => vi.clearAllMocks());

describe("requirePageRole", () => {
  it("returns the user when the role fits", async () => {
    signedInAs("HR_ADMIN");
    await expect(rbac.requirePageRole("HR_ADMIN")).resolves.toMatchObject({ id: "u1" });
    expect(navigation.forbidden).not.toHaveBeenCalled();
  });

  it("renders the 403 page for a wrong role", async () => {
    signedInAs("EMPLOYEE");
    await expect(rbac.requirePageRole("HR_ADMIN")).rejects.toThrow("403");
    expect(navigation.forbidden).toHaveBeenCalledOnce();
  });

  it("still sends signed-out visitors to /login", async () => {
    auth.mockResolvedValue(null);
    await expect(rbac.requirePageRole("HR_ADMIN")).rejects.toThrow("NEXT_REDIRECT;/login");
    expect(navigation.forbidden).not.toHaveBeenCalled();
  });
});

describe("requirePageSelfOrRole", () => {
  it("lets the owner through and 403s anyone else", async () => {
    signedInAs("EMPLOYEE");
    db.employee.findUnique.mockResolvedValueOnce({ userId: "u1" });
    await expect(rbac.requirePageSelfOrRole("e1", "HR_ADMIN")).resolves.toMatchObject({ id: "u1" });

    db.employee.findUnique.mockResolvedValueOnce({ userId: "someone-else" });
    await expect(rbac.requirePageSelfOrRole("e2", "HR_ADMIN")).rejects.toThrow("403");
  });
});

describe("requireRole", () => {
  it("keeps throwing AuthorizationError for Server Actions", async () => {
    signedInAs("EMPLOYEE");
    await expect(rbac.requireRole("HR_ADMIN")).rejects.toBeInstanceOf(rbac.AuthorizationError);
    expect(navigation.forbidden).not.toHaveBeenCalled();
  });
});
