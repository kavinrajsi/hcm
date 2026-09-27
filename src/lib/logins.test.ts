import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
  employee: { update: vi.fn() },
}));
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/password-links", () => ({
  createPasswordLink: vi.fn(async () => "http://app/reset-password?token=t"),
  INVITE_TTL_MS: 1,
}));

const { provisionLogin } = await import("./logins");

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue({ skipped: true });
});

describe("provisionLogin", () => {
  it("creates an Employee login linked to the employee", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u1" });

    const r = await provisionLogin({
      email: " Asha@Madarth.com ",
      name: "Asha",
      role: "EMPLOYEE",
      employeeId: "e1",
    });

    expect(db.user.create).toHaveBeenCalledWith({
      data: {
        email: "asha@madarth.com",
        name: "Asha",
        role: "EMPLOYEE",
        employee: { connect: { id: "e1" } },
      },
    });
    expect(r).toEqual({
      userId: "u1",
      link: "http://app/reset-password?token=t",
      emailed: false,
      email: "asha@madarth.com",
    });
  });

  it("reports emailed when the email actually went out", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u1" });
    sendEmail.mockResolvedValue({ skipped: false, id: "m1" });
    const r = await provisionLogin({ email: "a@x.com", role: "EMPLOYEE" });
    expect("emailed" in r && r.emailed).toBe(true);
  });

  it("still returns the link when sending fails", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u1" });
    sendEmail.mockRejectedValue(new Error("smtp down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await provisionLogin({ email: "a@x.com", role: "EMPLOYEE" });
    expect(r).toMatchObject({ link: expect.any(String), emailed: false });
  });

  it("links an existing unlinked account instead of duplicating it", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u7", employee: null });
    const r = await provisionLogin({
      email: "a@x.com",
      role: "EMPLOYEE",
      employeeId: "e1",
    });
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.employee.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { userId: "u7" },
    });
    expect(r).toEqual({
      error: "Linked to the existing account with this email",
    });
  });

  it("refuses an email already used by another employee's login", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u7", employee: { id: "e9" } });
    const r = await provisionLogin({
      email: "a@x.com",
      role: "EMPLOYEE",
      employeeId: "e1",
    });
    expect(r).toEqual({ error: "An account with this email already exists" });
    expect(db.employee.update).not.toHaveBeenCalled();
  });
});
