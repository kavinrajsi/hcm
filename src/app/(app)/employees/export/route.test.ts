import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ employee: { findMany: vi.fn() } }));
const rbac = vi.hoisted(() => ({
  requireRole: vi.fn(),
  AuthorizationError: class extends Error {},
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rbac", () => rbac);
vi.mock("@/lib/crypto", () => ({ decryptField: (value: string) => `dec(${value})` }));

const { GET } = await import("./route");

describe("GET /employees/export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-HR", async () => {
    rbac.requireRole.mockRejectedValue(new rbac.AuthorizationError());
    const response = await GET();
    expect(response.status).toBe(403);
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });

  it("returns a CSV with decrypted statutory fields", async () => {
    rbac.requireRole.mockResolvedValue({ role: "HR_ADMIN" });
    db.employee.findMany.mockResolvedValue([
      {
        empId: "E1",
        name: "Asha",
        workEmail: "a@x.com",
        department: "Design",
        designation: "Designer",
        dateOfJoining: new Date("2024-01-02"),
        empType: "PERMANENT",
        isFresher: false,
        panEnc: "cipher",
        manager: { empId: "E0" },
      },
    ]);
    const response = await GET();
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    const text = await response.text();
    expect(text.split("\r\n")[0]).toContain("empId,name,gender");
    expect(text).toContain("dec(cipher)");
    expect(text).toContain("2024-01-02");
  });
});
