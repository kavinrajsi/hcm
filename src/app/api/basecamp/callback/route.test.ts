import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const basecamp = vi.hoisted(() => ({
  exchangeCode: vi.fn(async () => ({ access_token: "t", expires_in: 3600 })),
  fetchAccountId: vi.fn(async () => "acct"),
  saveToken: vi.fn(),
}));
vi.mock("@/lib/basecamp", () => basecamp);
vi.mock("@/lib/rbac", () => ({ currentUser: vi.fn(async () => ({ id: "hr", role: "HR_ADMIN" })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { GET } = await import("./route");

const callback = (query: string, cookie?: string) =>
  GET(
    new NextRequest(`https://hcm.test/api/basecamp/callback?${query}`, {
      headers: cookie ? { cookie: `hcm_basecamp_state=${cookie}` } : {},
    }),
  );

beforeEach(() => vi.clearAllMocks());

describe("Basecamp OAuth callback", () => {
  it("rejects a code without the state this browser was given", async () => {
    expect((await callback("code=attacker&state=abc")).status).toBe(400);
    expect((await callback("code=attacker&state=abc", "different")).status).toBe(400);
    expect((await callback("code=attacker", "abc")).status).toBe(400);
    expect(basecamp.exchangeCode).not.toHaveBeenCalled();
    expect(basecamp.saveToken).not.toHaveBeenCalled();
  });

  it("connects when the state matches, then clears it", async () => {
    const response = await callback("code=good&state=abc", "abc");
    expect(basecamp.saveToken).toHaveBeenCalledWith("hr", expect.anything(), "acct");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://hcm.test/quantum?connected=1");
    expect(response.headers.get("set-cookie")).toMatch(/hcm_basecamp_state=;/);
  });

  it("reports a failed token exchange instead of crashing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    basecamp.exchangeCode.mockRejectedValueOnce(new Error("Basecamp token exchange failed: 401"));
    expect((await callback("code=bad&state=abc", "abc")).status).toBe(502);
  });
});
