import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  passwordResetToken: { findFirst: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  user: { update: vi.fn() },
  $transaction: vi.fn(),
}));

const sessions = vi.hoisted(() => ({ revokeAllSessions: vi.fn() }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/login-sessions", () => sessions);

const { resetPassword } = await import("./actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("resetPassword", () => {
  it("puts password problems under their fields", async () => {
    const short = await resetPassword({}, form({ token: "t", newPassword: "short", confirmPassword: "short" }));
    expect(short.fieldErrors?.newPassword).toEqual(["Password must be at least 8 characters"]);
    const mismatch = await resetPassword(
      {},
      form({ token: "t", newPassword: "longenough", confirmPassword: "different1" }),
    );
    expect(mismatch.fieldErrors?.confirmPassword).toEqual(["Passwords do not match"]);
    expect(db.passwordResetToken.findFirst).not.toHaveBeenCalled();
  });

  it("treats a missing or expired link as a form error, not a field one", async () => {
    const missing = await resetPassword({}, form({ newPassword: "longenough", confirmPassword: "longenough" }));
    expect(missing).toEqual({ error: "This reset link is invalid or has expired" });
    db.passwordResetToken.findFirst.mockResolvedValue(null);
    const expired = await resetPassword(
      {},
      form({ token: "t", newPassword: "longenough", confirmPassword: "longenough" }),
    );
    expect(expired).toEqual({ error: "This reset link is invalid or has expired" });
  });

  it("signs the user out of every device", async () => {
    db.passwordResetToken.findFirst.mockResolvedValue({ id: "t1", userId: "u1" });
    expect(
      await resetPassword({}, form({ token: "t", newPassword: "longenough", confirmPassword: "longenough" })),
    ).toEqual({ ok: true });
    expect(sessions.revokeAllSessions).toHaveBeenCalledWith("u1");
  });
});
