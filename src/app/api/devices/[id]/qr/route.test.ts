import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const currentUser = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rbac", () => ({ currentUser }));
vi.mock("@/lib/db", () => ({ db: { device: { findUnique } } }));

const { GET } = await import("./route");

const request = { nextUrl: { origin: "http://localhost:3000" } } as unknown as NextRequest;
const ctx = { params: Promise.resolve({ id: "d1" }) };
const device = {
  assetTag: "MAD-LAP-0001",
  publicToken: "tok123",
  holder: { userId: "u-holder", manager: { userId: "u-boss" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AUTH_URL;
  findUnique.mockResolvedValue(device);
});

describe("GET /api/devices/[id]/qr", () => {
  it("needs a signed-in user with access", async () => {
    currentUser.mockResolvedValue(null);
    expect((await GET(request, ctx)).status).toBe(401);
    currentUser.mockResolvedValue({ id: "u-other", role: "EMPLOYEE" });
    expect((await GET(request, ctx)).status).toBe(403);
  });

  it("404s for an unknown device", async () => {
    currentUser.mockResolvedValue({ id: "hr", role: "HR_ADMIN" });
    findUnique.mockResolvedValue(null);
    expect((await GET(request, ctx)).status).toBe(404);
  });

  it("returns a PNG named after the asset tag for the holder", async () => {
    currentUser.mockResolvedValue({ id: "u-holder", role: "EMPLOYEE" });
    const response = await GET(request, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toContain("MAD-LAP-0001.png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
