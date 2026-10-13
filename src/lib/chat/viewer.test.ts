import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  basecampToken: { findUnique: vi.fn(), update: vi.fn() },
  employee: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
const basecamp = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock("@/lib/basecamp", () => basecamp);
const myEmployee = vi.hoisted(() => ({ myEmployeeId: vi.fn() }));
vi.mock("@/lib/my-employee", () => myEmployee);

const { myBasecampPersonId } = await import("./viewer");
const user = { id: "u1", email: "someone@example.com" };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  myEmployee.myEmployeeId.mockResolvedValue(null);
});

describe("myBasecampPersonId", () => {
  it("uses the remembered person behind the viewer's Basecamp connection", async () => {
    db.basecampToken.findUnique.mockResolvedValue({ personId: "31799349" });
    expect(await myBasecampPersonId(user)).toBe("31799349");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Basecamp once who the connection is, and remembers it", async () => {
    db.basecampToken.findUnique.mockResolvedValue({ personId: null });
    basecamp.getAccessToken.mockResolvedValue({ accessToken: "t", accountId: "5" });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 31799349, name: "x" })));
    expect(await myBasecampPersonId(user)).toBe("31799349");
    expect(fetchMock.mock.calls[0][0]).toBe("https://3.basecampapi.com/5/my/profile.json");
    expect(db.basecampToken.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { personId: "31799349" } });
  });

  it("falls back to the linked employee without a connection", async () => {
    db.basecampToken.findUnique.mockResolvedValue(null);
    myEmployee.myEmployeeId.mockResolvedValue("emp-1");
    db.employee.findUnique.mockResolvedValue({ basecampPersonId: "77" });
    expect(await myBasecampPersonId(user)).toBe("77");
  });

  it("falls back to the employee when Basecamp can't be reached", async () => {
    db.basecampToken.findUnique.mockResolvedValue({ personId: null });
    basecamp.getAccessToken.mockResolvedValue({ accessToken: "t", accountId: "5" });
    fetchMock.mockRejectedValue(new Error("offline"));
    myEmployee.myEmployeeId.mockResolvedValue("emp-1");
    db.employee.findUnique.mockResolvedValue({ basecampPersonId: "77" });
    expect(await myBasecampPersonId(user)).toBe("77");
    expect(db.basecampToken.update).not.toHaveBeenCalled();
  });

  it("is nobody when there's neither", async () => {
    db.basecampToken.findUnique.mockResolvedValue(null);
    expect(await myBasecampPersonId(user)).toBeNull();
  });
});
