import { beforeEach, describe, expect, it, vi } from "vitest";

// Server actions tested against a mocked database: the guards that keep the
// app from losing its last HR admin, and invite validation.

const db = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  employee: { findUnique: vi.fn() },
}));
const me = { id: "me", role: "HR_ADMIN", email: "hr@x.com" };

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({ requireRole: vi.fn(async () => me) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ skipped: true })),
}));
vi.mock("@/lib/password-links", () => ({
  createPasswordLink: vi.fn(async () => "http://app/reset-password?token=t"),
  INVITE_TTL_MS: 1,
  RESET_TTL_MS: 1,
}));

const { setUserRole, setUserDisabled, inviteUser } = await import("./actions");

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => vi.clearAllMocks());

describe("setUserRole", () => {
  it("refuses to demote the last active HR admin", async () => {
    db.user.findUnique.mockResolvedValue({ role: "HR_ADMIN" });
    db.user.count.mockResolvedValue(0);
    const r = await setUserRole("u1", "EMPLOYEE");
    expect(r.error).toMatch(/at least one active HR admin/);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("demotes an HR admin when another active one exists", async () => {
    db.user.findUnique.mockResolvedValue({ role: "HR_ADMIN" });
    db.user.count.mockResolvedValue(1);
    expect(await setUserRole("u1", "MANAGER")).toEqual({});
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: "MANAGER" },
    });
  });

  it("promotes without checking the admin count", async () => {
    db.user.findUnique.mockResolvedValue({ role: "EMPLOYEE" });
    expect(await setUserRole("u2", "HR_ADMIN")).toEqual({});
    expect(db.user.count).not.toHaveBeenCalled();
  });

  it("rejects an unknown role", async () => {
    await expect(setUserRole("u1", "OWNER" as never)).rejects.toThrow();
  });
});

describe("setUserDisabled", () => {
  it("won't let you disable yourself", async () => {
    const r = await setUserDisabled("me", true);
    expect(r.error).toMatch(/your own account/);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("won't disable the last active HR admin", async () => {
    db.user.findUnique.mockResolvedValue({ role: "HR_ADMIN" });
    db.user.count.mockResolvedValue(0);
    const r = await setUserDisabled("u1", true);
    expect(r.error).toMatch(/at least one active HR admin/);
  });

  it("disables and re-enables", async () => {
    db.user.findUnique.mockResolvedValue({ role: "EMPLOYEE" });
    await setUserDisabled("u2", true);
    expect(db.user.update.mock.calls[0][0].data.disabledAt).toBeInstanceOf(
      Date,
    );
    await setUserDisabled("u2", false);
    expect(db.user.update.mock.calls[1][0].data).toEqual({ disabledAt: null });
  });
});

describe("inviteUser", () => {
  it("needs an employee or a valid email", async () => {
    const r = await inviteUser({}, form({ role: "EMPLOYEE", email: "nope" }));
    expect(r.error).toMatch(/valid email/);
  });

  it("refuses an employee who already has a login", async () => {
    db.employee.findUnique.mockResolvedValue({
      workEmail: "a@x.com",
      name: "A",
      userId: "u9",
      dateOfExit: null,
    });
    const r = await inviteUser(
      {},
      form({ role: "EMPLOYEE", employeeId: "e1" }),
    );
    expect(r.error).toMatch(/already has a login/);
  });

  it("refuses an exited employee", async () => {
    db.employee.findUnique.mockResolvedValue({
      workEmail: "a@x.com",
      name: "A",
      userId: null,
      dateOfExit: new Date(),
    });
    const r = await inviteUser(
      {},
      form({ role: "EMPLOYEE", employeeId: "e1" }),
    );
    expect(r.error).toMatch(/exited/);
  });

  it("refuses an email that already has an account", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u5" });
    const r = await inviteUser(
      {},
      form({ role: "MANAGER", email: "Taken@X.com" }),
    );
    expect(r.error).toMatch(/already exists/);
    expect(db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "taken@x.com" } }),
    );
  });

  it("creates a login linked to the employee and returns the link", async () => {
    db.employee.findUnique.mockResolvedValue({
      workEmail: "Asha@Madarth.com",
      name: "Asha",
      userId: null,
      dateOfExit: null,
    });
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "new" });

    const r = await inviteUser({}, form({ role: "MANAGER", employeeId: "e1" }));

    expect(db.user.create).toHaveBeenCalledWith({
      data: {
        email: "asha@madarth.com",
        name: "Asha",
        role: "MANAGER",
        employee: { connect: { id: "e1" } },
      },
    });
    expect(r).toEqual({
      link: "http://app/reset-password?token=t",
      emailed: false, // email not configured → HR copies the link
      email: "asha@madarth.com",
    });
  });
});
