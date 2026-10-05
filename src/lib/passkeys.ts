import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { decodeClientDataJSON, isoBase64URL } from "@simplewebauthn/server/helpers";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { db } from "@/lib/db";

// Passkey (WebAuthn) sign-in. A signed-in user adds passkeys on My Profile;
// /login can then sign in with one instead of a password. Accounts still
// only come from HR provisioning: a passkey always belongs to an existing
// user.
//
// Each ceremony uses a one-time challenge stored in the DB, so it's
// single-use across function instances.

export const MAX_PASSKEYS = 10;
const CHALLENGE_TTL_MS = 5 * 60_000;

/** Passkeys are bound to AUTH_URL's host; other hosts (previews) use passwords. */
export function rpConfig() {
  const origin = (process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return { rpName: "HCM", rpID: new URL(origin).hostname, origin };
}

async function saveChallenge(challenge: string, userId: string | null) {
  await db.webAuthnChallenge.create({
    data: { challenge, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
}

/**
 * Uses up the challenge the browser signed. True only the first time, before
 * it expires, and for the same user it was issued to (null = sign-in).
 */
async function consumeChallenge(
  clientDataJSON: string,
  userId: string | null,
): Promise<string | null> {
  let challenge: string;
  try {
    challenge = decodeClientDataJSON(clientDataJSON).challenge;
  } catch {
    return null;
  }
  const { count } = await db.webAuthnChallenge.deleteMany({
    where: { challenge, userId, expiresAt: { gt: new Date() } },
  });
  return count === 1 ? challenge : null;
}

/** Options for the browser to create a passkey for this user. */
export async function registrationOptions(user: {
  id: string;
  email: string;
  name: string | null;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await db.passkey.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });
  const { rpName, rpID } = rpConfig();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: user.id,
    userName: user.email,
    userDisplayName: user.name ?? user.email,
    attestationType: "none",
    excludeCredentials: existing.map((passkey) => ({
      id: isoBase64URL.toBuffer(passkey.credentialId),
      type: "public-key",
      transports: passkey.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await saveChallenge(options.challenge, user.id);
  return options;
}

export type RegisterResult = { ok: true } | { ok: false; error: string };

/** Verifies the browser's new passkey and saves it to the user. */
export async function registerPasskey(
  userId: string,
  response: RegistrationResponseJSON,
  name: string,
): Promise<RegisterResult> {
  if ((await db.passkey.count({ where: { userId } })) >= MAX_PASSKEYS)
    return { ok: false, error: `You can have up to ${MAX_PASSKEYS} passkeys. Remove one first.` };

  const challenge = await consumeChallenge(response.response?.clientDataJSON, userId);
  if (!challenge) return { ok: false, error: "That took too long. Try again." };

  const { rpID, origin } = rpConfig();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (error) {
    console.error("[passkeys] registration failed", error);
    return { ok: false, error: "That passkey couldn't be added. Try again." };
  }
  const info = verification.registrationInfo;
  if (!verification.verified || !info)
    return { ok: false, error: "That passkey couldn't be added. Try again." };

  await db.passkey.create({
    data: {
      userId,
      credentialId: isoBase64URL.fromBuffer(info.credentialID),
      publicKey: Buffer.from(info.credentialPublicKey),
      counter: info.counter,
      transports: response.response.transports ?? [],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      name: name.trim().slice(0, 60) || "Passkey",
    },
  });
  return { ok: true };
}

/** Options for signing in: any passkey on this device (no email needed). */
export async function authenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID: rpConfig().rpID,
    userVerification: "preferred",
  });
  await saveChallenge(options.challenge, null);
  return options;
}

/** The user a signed sign-in assertion belongs to, or null if it doesn't verify. */
export async function verifyPasskeySignIn(response: AuthenticationResponseJSON) {
  if (typeof response?.id !== "string") return null;
  const passkey = await db.passkey.findUnique({
    where: { credentialId: response.id },
    include: { user: true },
  });
  if (!passkey) return null;

  const challenge = await consumeChallenge(response.response?.clientDataJSON, null);
  if (!challenge) return null;

  const { rpID, origin } = rpConfig();
  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: isoBase64URL.toBuffer(passkey.credentialId),
        credentialPublicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports as AuthenticatorTransportFuture[],
      },
    });
    if (!verified) return null;
    await db.passkey.update({
      where: { id: passkey.id },
      data: { counter: authenticationInfo.newCounter, lastUsedAt: new Date() },
    });
    return passkey.user;
  } catch (error) {
    console.error("[passkeys] sign-in failed", error);
    return null;
  }
}
