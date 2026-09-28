import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ employee: { findMany: vi.fn() } }));
const provisionLogin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logins", () => ({
  provisionLogin,
  mailPasswordLink: vi.fn(),
}));

const { createLoginsForAll } = await import("./actions");

beforeEach(() => vi.clearAllMocks());

describe("createLoginsForAll", () => {
  it("only targets current employees without a login", async () => {
    db.employee.findMany.mockResolvedValue([]);
    await createLoginsForAll();
    expect(db.employee.findMany.mock.calls[0][0].where).toEqual({
      userId: null,
      dateOfExit: null,
    });
  });

  it("creates an Employee login per person and tallies the outcome", async () => {
    db.employee.findMany.mockResolvedValue([
      { id: "e1", empId: "E1", name: "A", workEmail: "a@x.com" },
      { id: "e2", empId: "E2", name: "B", workEmail: "b@x.com" },
      { id: "e3", empId: "E3", name: "C", workEmail: "c@x.com" },
      { id: "e4", empId: "E4", name: "D", workEmail: "d@x.com" },
      { id: "e5", empId: "E5", name: "E", workEmail: "e@x.com" },
    ]);
    provisionLogin
      .mockResolvedValueOnce({
        userId: "u1",
        link: "l",
        emailed: true,
        email: "a@x.com",
      })
      .mockResolvedValueOnce({
        userId: "u2",
        link: "l",
        emailed: false,
        email: "b@x.com",
      })
      .mockResolvedValueOnce({
        error: "Linked to the existing account with this email",
      })
      .mockResolvedValueOnce({
        error: "An account with this email already exists",
      })
      .mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createLoginsForAll();

    expect(provisionLogin).toHaveBeenCalledWith({
      email: "a@x.com",
      name: "A",
      role: "EMPLOYEE",
      employeeId: "e1",
    });
    expect(result).toEqual({
      created: 2,
      emailed: 1,
      linked: 1,
      failed: ["E4", "E5"],
    });
  });
});
