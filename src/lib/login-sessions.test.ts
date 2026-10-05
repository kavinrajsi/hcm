import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  loginSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));
const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));

const sessions = await import("./login-sessions");

const MINUTE = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);

beforeEach(() => {
  vi.clearAllMocks();
  requestHeaders.current = new Headers({
    "x-forwarded-for": "49.37.1.2, 10.0.0.1",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36",
    "x-vercel-ip-city": "Chennai",
    "x-vercel-ip-country-region": "TN",
    "x-vercel-ip-country": "IN",
  });
  db.loginSession.create.mockResolvedValue({ id: "s1" });
  db.loginSession.update.mockResolvedValue({});
});

describe("startLoginSession", () => {
  it("records the device, IP and location of the sign-in", async () => {
    expect(await sessions.startLoginSession("u1", "passkey")).toBe("s1");
    expect(db.loginSession.create.mock.calls[0][0].data).toEqual({
      userId: "u1",
      method: "passkey",
      userAgent: expect.stringContaining("Chrome"),
      ip: "49.37.1.2",
      city: "Chennai",
      region: "TN",
      country: "IN",
    });
  });

  it("decodes city names Vercel URL-encodes", () => {
    const context = sessions.requestContext(new Headers({ "x-vercel-ip-city": "S%C3%A3o%20Paulo" }));
    expect(context.city).toBe("São Paulo");
    expect(context.ip).toBeNull();
  });
});

describe("checkAndTouch", () => {
  it("accepts a live session without writing when it was just used", async () => {
    db.loginSession.findUnique.mockResolvedValue({ userId: "u1", revokedAt: null, lastSeenAt: ago(MINUTE) });
    expect(await sessions.checkAndTouch("s1", "u1")).toBe(true);
    expect(db.loginSession.update).not.toHaveBeenCalled();
  });

  it("refreshes when and where it was last used every few minutes", async () => {
    db.loginSession.findUnique.mockResolvedValue({ userId: "u1", revokedAt: null, lastSeenAt: ago(10 * MINUTE) });
    expect(await sessions.checkAndTouch("s1", "u1")).toBe(true);
    expect(db.loginSession.update.mock.calls[0][0].data).toMatchObject({ ip: "49.37.1.2", city: "Chennai" });
  });

  it("refuses a signed-out, expired, missing or someone else's session", async () => {
    db.loginSession.findUnique.mockResolvedValueOnce({ userId: "u1", revokedAt: new Date(), lastSeenAt: ago(MINUTE) });
    expect(await sessions.checkAndTouch("s1", "u1")).toBe(false);
    db.loginSession.findUnique.mockResolvedValueOnce({ userId: "u1", revokedAt: null, lastSeenAt: ago(31 * 24 * 60 * MINUTE) });
    expect(await sessions.checkAndTouch("s1", "u1")).toBe(false);
    db.loginSession.findUnique.mockResolvedValueOnce(null);
    expect(await sessions.checkAndTouch("s1", "u1")).toBe(false);
    db.loginSession.findUnique.mockResolvedValueOnce({ userId: "u2", revokedAt: null, lastSeenAt: ago(MINUTE) });
    expect(await sessions.checkAndTouch("s1", "u1")).toBe(false);
  });
});

describe("revoking", () => {
  it("only ever touches the user's own live sessions", async () => {
    await sessions.revokeSession("s9", "u1");
    await sessions.revokeOtherSessions("u1", "s1");
    await sessions.revokeAllSessions("u1");
    const wheres = db.loginSession.updateMany.mock.calls.map(([arg]) => arg.where);
    expect(wheres).toEqual([
      { id: "s9", userId: "u1", revokedAt: null },
      { userId: "u1", revokedAt: null, id: { not: "s1" } },
      { userId: "u1", revokedAt: null },
    ]);
  });
});

describe("describeDevice", () => {
  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", "Safari on macOS"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1", "Safari on iPhone"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0", "Edge on Windows"],
    ["Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36", "Chrome on Android"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox on Linux"],
    [null, "Unknown device"],
  ])("%s → %s", (userAgent, expected) => {
    expect(sessions.describeDevice(userAgent)).toBe(expected);
  });
});

describe("describePlace", () => {
  it("joins what's known", () => {
    expect(sessions.describePlace({ city: "Chennai", region: "TN", country: "IN" })).toBe("Chennai, TN, IN");
    expect(sessions.describePlace({ city: null, region: null, country: null })).toBeNull();
  });
});
