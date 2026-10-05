import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  passkey: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  webAuthnChallenge: { create: vi.fn(), deleteMany: vi.fn() },
}));
const webauthn = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "reg-challenge" })),
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "auth-challenge" })),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@simplewebauthn/server", () => webauthn);

const { authenticationOptions, registerPasskey, registrationOptions, rpConfig, verifyPasskeySignIn } =
  await import("./passkeys");

// clientDataJSON is base64url JSON carrying the challenge the browser signed.
const clientData = (challenge: string) =>
  Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: "https://connect.madarth.com" })).toString(
    "base64url",
  );

const signIn = (challenge = "auth-challenge") =>
  ({ id: "cred-1", rawId: "cred-1", type: "public-key", response: { clientDataJSON: clientData(challenge) } }) as never;
const registration = (challenge = "reg-challenge") =>
  ({ id: "cred-1", rawId: "cred-1", type: "public-key", response: { clientDataJSON: clientData(challenge), transports: ["internal"] } }) as never;

const stored = {
  id: "pk1",
  credentialId: "Y3JlZC0x",
  publicKey: Buffer.from([1, 2, 3]),
  counter: 4,
  transports: ["internal"],
  user: { id: "u1", email: "a@x.com", name: "A", disabledAt: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.AUTH_URL = "https://connect.madarth.com/";
  db.passkey.findMany.mockResolvedValue([]);
  db.passkey.count.mockResolvedValue(0);
  db.passkey.findUnique.mockResolvedValue(stored);
  db.webAuthnChallenge.deleteMany.mockResolvedValue({ count: 1 });
});

describe("rpConfig", () => {
  it("binds passkeys to AUTH_URL's host", () => {
    expect(rpConfig()).toEqual({ rpName: "HCM", rpID: "connect.madarth.com", origin: "https://connect.madarth.com" });
  });
});

describe("challenges", () => {
  it("stores a registration challenge for the user and a sign-in challenge for nobody", async () => {
    await registrationOptions({ id: "u1", email: "a@x.com", name: null });
    await authenticationOptions();
    expect(db.webAuthnChallenge.create.mock.calls.map(([arg]) => [arg.data.challenge, arg.data.userId])).toEqual([
      ["reg-challenge", "u1"],
      ["auth-challenge", null],
    ]);
  });

  it("consumes a challenge only if unexpired and issued to the same user", async () => {
    db.webAuthnChallenge.deleteMany.mockResolvedValue({ count: 0 });
    expect(await registerPasskey("u1", registration(), "Laptop")).toEqual({ ok: false, error: "That took too long. Try again." });
    const { where } = db.webAuthnChallenge.deleteMany.mock.calls[0][0];
    expect(where.challenge).toBe("reg-challenge");
    expect(where.userId).toBe("u1");
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    expect(webauthn.verifyRegistrationResponse).not.toHaveBeenCalled();
  });
});

describe("registerPasskey", () => {
  it("saves a verified passkey", async () => {
    webauthn.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialID: new Uint8Array([1, 2]),
        credentialPublicKey: new Uint8Array([3]),
        counter: 0,
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
      },
    });
    expect(await registerPasskey("u1", registration(), "  Work laptop ")).toEqual({ ok: true });
    const { data } = db.passkey.create.mock.calls[0][0];
    expect(data).toMatchObject({ userId: "u1", credentialId: "AQI", name: "Work laptop", transports: ["internal"], backedUp: true });
  });

  it("caps passkeys per user", async () => {
    db.passkey.count.mockResolvedValue(10);
    expect((await registerPasskey("u1", registration(), "x")).ok).toBe(false);
    expect(db.webAuthnChallenge.deleteMany).not.toHaveBeenCalled();
  });
});

describe("verifyPasskeySignIn", () => {
  it("returns the user and moves the counter on", async () => {
    webauthn.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 5 } });
    expect(await verifyPasskeySignIn(signIn())).toBe(stored.user);
    expect(db.passkey.update.mock.calls[0][0].data.counter).toBe(5);
    expect(db.webAuthnChallenge.deleteMany.mock.calls[0][0].where.userId).toBeNull();
  });

  it("refuses an unknown passkey", async () => {
    db.passkey.findUnique.mockResolvedValue(null);
    expect(await verifyPasskeySignIn(signIn())).toBeNull();
  });

  it("refuses a reused challenge", async () => {
    db.webAuthnChallenge.deleteMany.mockResolvedValue({ count: 0 });
    expect(await verifyPasskeySignIn(signIn())).toBeNull();
    expect(webauthn.verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it("refuses a bad signature", async () => {
    webauthn.verifyAuthenticationResponse.mockRejectedValue(new Error("bad signature"));
    expect(await verifyPasskeySignIn(signIn())).toBeNull();
    expect(db.passkey.update).not.toHaveBeenCalled();
  });
});
