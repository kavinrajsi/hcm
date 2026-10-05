import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  authAttempt: { count: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

const { clientIp, isThrottled, loginLimits, recordAttempt, resetLimits } =
  await import("./auth-throttle");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("auth throttle", () => {
  it("throttles once any limit is reached", async () => {
    db.authAttempt.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    expect(await isThrottled(loginLimits("a@x.com", "1.2.3.4"))).toBe(true);
  });

  it("lets requests through under the limits", async () => {
    db.authAttempt.count.mockResolvedValue(4);
    expect(await isThrottled(loginLimits("a@x.com", "1.2.3.4"))).toBe(false);
  });

  it("counts only attempts inside the window", async () => {
    db.authAttempt.count.mockResolvedValue(0);
    await isThrottled(resetLimits("a@x.com", null));
    const { where } = db.authAttempt.count.mock.calls[0][0];
    expect(where.key).toBe("reset:email:a@x.com");
    const minutes = (Date.now() - where.createdAt.gt.getTime()) / 60_000;
    expect(Math.round(minutes)).toBe(60);
  });

  it("fails open when the table can't be read", async () => {
    db.authAttempt.count.mockRejectedValue(new Error("down"));
    expect(await isThrottled(loginLimits("a@x.com", null))).toBe(false);
  });

  it("records one row per limit", async () => {
    await recordAttempt(loginLimits("a@x.com", "1.2.3.4"));
    expect(db.authAttempt.createMany).toHaveBeenCalledWith({
      data: [{ key: "login:email:a@x.com" }, { key: "login:ip:1.2.3.4" }],
    });
  });

  it("reads the first forwarded IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers())).toBeNull();
  });
});
