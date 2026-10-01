import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/logins", () => ({ mailPasswordLink: vi.fn(async () => true) }));
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

beforeEach(() => vi.clearAllMocks());

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
});
