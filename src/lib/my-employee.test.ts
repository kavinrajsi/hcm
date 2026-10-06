import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

const { myEmployeeId } = await import("./my-employee");
const me = { id: "u1", email: "Asha@Madarth.com" };

beforeEach(() => {
  vi.clearAllMocks();
  db.employee.findUnique.mockResolvedValue(null);
  db.employee.findFirst.mockResolvedValue(null);
  db.employee.updateMany.mockResolvedValue({ count: 1 });
});

describe("myEmployeeId", () => {
  it("uses the record linked to this login", async () => {
    db.employee.findUnique.mockResolvedValueOnce({ id: "e1" });
    expect(await myEmployeeId(me)).toBe("e1");
    expect(db.employee.findFirst).not.toHaveBeenCalled();
  });

  it("falls back only to an unlinked record with the same work email, and links it", async () => {
    db.employee.findFirst.mockResolvedValue({ id: "e2" });
    expect(await myEmployeeId(me)).toBe("e2");
    expect(db.employee.findFirst.mock.calls[0][0].where).toEqual({
      userId: null,
      workEmail: { equals: "Asha@Madarth.com", mode: "insensitive" },
    });
    expect(db.employee.updateMany).toHaveBeenCalledWith({ where: { id: "e2", userId: null }, data: { userId: "u1" } });
  });

  it("never returns a record linked to another login", async () => {
    // The email matches a record someone else's login already owns: findFirst
    // only looks at unlinked records, so nothing comes back.
    expect(await myEmployeeId(me)).toBeNull();
  });

  it("loses a race to link cleanly", async () => {
    db.employee.findFirst.mockResolvedValue({ id: "e2" });
    db.employee.updateMany.mockResolvedValue({ count: 0 });
    db.employee.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: "someone-else" });
    expect(await myEmployeeId(me)).toBeNull();
  });
});
