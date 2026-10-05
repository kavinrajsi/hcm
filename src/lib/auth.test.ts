import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const throttle = vi.hoisted(() => ({
  isThrottled: vi.fn(),
  recordAttempt: vi.fn(),
  clearAttempts: vi.fn(),
}));

const passkeys = vi.hoisted(() => ({ verifyPasskeySignIn: vi.fn() }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/passkeys", () => passkeys);
vi.mock("@/lib/auth-throttle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth-throttle")>()),
  ...throttle,
}));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(async (password: string) => password === "right") },
}));
vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
  CredentialsSignin: class extends Error {
    code = "credentials";
  },
}));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));

const { authorizeCredentials, authorizePasskey, TooManyAttempts } = await import("./auth");

const request = new Request("https://h/api/auth/callback/credentials", {
  headers: { "x-forwarded-for": "1.2.3.4" },
});
const user = { id: "u1", email: "a@x.com", name: "A", passwordHash: "hash", disabledAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  throttle.isThrottled.mockResolvedValue(false);
  db.user.findUnique.mockResolvedValue(user);
});

describe("authorizeCredentials", () => {
  it("signs in and forgets earlier failures", async () => {
    const result = await authorizeCredentials({ email: " A@x.com ", password: "right" }, request);
    expect(result).toEqual({ id: "u1", email: "a@x.com", name: "A" });
    expect(throttle.clearAttempts).toHaveBeenCalledWith("login:email:a@x.com");
    expect(throttle.recordAttempt).not.toHaveBeenCalled();
  });

  it("records a wrong password against the account and the IP", async () => {
    expect(await authorizeCredentials({ email: "a@x.com", password: "wrong" }, request)).toBeNull();
    const keys = throttle.recordAttempt.mock.calls[0][0].map((limit: { key: string }) => limit.key);
    expect(keys).toEqual(["login:email:a@x.com", "login:ip:1.2.3.4"]);
  });

  it("records attempts on unknown accounts too", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await authorizeCredentials({ email: "who@x.com", password: "x" }, request)).toBeNull();
    expect(throttle.recordAttempt).toHaveBeenCalled();
  });

  it("refuses without checking the password once throttled", async () => {
    throttle.isThrottled.mockResolvedValue(true);
    await expect(
      authorizeCredentials({ email: "a@x.com", password: "right" }, request),
    ).rejects.toBeInstanceOf(TooManyAttempts);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a disabled account", async () => {
    db.user.findUnique.mockResolvedValue({ ...user, disabledAt: new Date() });
    expect(await authorizeCredentials({ email: "a@x.com", password: "right" }, request)).toBeNull();
  });
});

describe("authorizePasskey", () => {
  const response = JSON.stringify({ id: "cred-1" });

  it("signs in the passkey's user", async () => {
    passkeys.verifyPasskeySignIn.mockResolvedValue(user);
    expect(await authorizePasskey({ response }, request)).toEqual({ id: "u1", email: "a@x.com", name: "A" });
  });

  it("refuses a disabled user and counts the failure", async () => {
    passkeys.verifyPasskeySignIn.mockResolvedValue({ ...user, disabledAt: new Date() });
    expect(await authorizePasskey({ response }, request)).toBeNull();
    expect(throttle.recordAttempt.mock.calls[0][0][0].key).toBe("passkey:ip:1.2.3.4");
  });

  it("refuses garbage without verifying", async () => {
    expect(await authorizePasskey({ response: "{nope" }, request)).toBeNull();
    expect(passkeys.verifyPasskeySignIn).not.toHaveBeenCalled();
  });

  it("refuses once throttled", async () => {
    throttle.isThrottled.mockResolvedValue(true);
    await expect(authorizePasskey({ response }, request)).rejects.toBeInstanceOf(TooManyAttempts);
  });
});
