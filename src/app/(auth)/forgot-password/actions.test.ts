import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const mail = vi.hoisted(() => ({ mailPasswordLink: vi.fn() }));
const throttle = vi.hoisted(() => ({ isThrottled: vi.fn(), recordAttempt: vi.fn() }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }),
}));
vi.mock("@/lib/logins", () => mail);
vi.mock("@/lib/auth-throttle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-throttle")>()),
  ...throttle,
}));
vi.mock("@/lib/password-links", () => ({
  createPasswordLink: vi.fn(async () => "http://app/reset-password?token=t"),
  RESET_TTL_MS: 1,
}));

const { requestPasswordReset } = await import("./actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  throttle.isThrottled.mockResolvedValue(false);
  mail.mailPasswordLink.mockResolvedValue(true);
});

describe("requestPasswordReset", () => {
  it("flags a bad email on the email field", async () => {
    const state = await requestPasswordReset({}, form({ email: "nope" }));
    expect(state.fieldErrors?.email).toEqual(["Enter a valid email"]);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("answers the same whether or not the account exists", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await requestPasswordReset({}, form({ email: "who@x.com" }))).toEqual({ ok: true });
  });

  it("answers the same and sends nothing when throttled", async () => {
    throttle.isThrottled.mockResolvedValue(true);
    expect(await requestPasswordReset({}, form({ email: "a@x.com" }))).toEqual({ ok: true });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(mail.mailPasswordLink).not.toHaveBeenCalled();
  });

  it("counts every request against the email and the IP", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await requestPasswordReset({}, form({ email: "A@x.com" }));
    const keys = throttle.recordAttempt.mock.calls[0][0].map((limit: { key: string }) => limit.key);
    expect(keys).toEqual(["reset:email:a@x.com", "reset:ip:1.2.3.4"]);
  });

  it("never logs the link when sending fails in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    db.user.findUnique.mockResolvedValue({ id: "u1" });
    mail.mailPasswordLink.mockResolvedValue(false);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await requestPasswordReset({}, form({ email: "a@x.com" }));
    const printed = [...log.mock.calls, ...error.mock.calls].flat().join(" ");
    expect(printed).not.toContain("token=");
    expect(printed).toContain("u1");
  });
});
