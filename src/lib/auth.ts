import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import {
  clearAttempts,
  clientIp,
  isThrottled,
  loginLimits,
  passkeyLimits,
  recordAttempt,
} from "@/lib/auth-throttle";
import { verifyPasskeySignIn } from "@/lib/passkeys";

/** Sign-in refused because of too many recent failures. */
export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

/** Email + password sign-in, throttled per account and per IP. */
export async function authorizeCredentials(
  credentials: Partial<Record<"email" | "password", unknown>>,
  request: Request,
) {
  const rawEmail = credentials?.email;
  const password = credentials?.password;
  if (typeof rawEmail !== "string" || typeof password !== "string") {
    return null;
  }
  const email = rawEmail.trim().toLowerCase();
  // Checked before bcrypt so guessing is throttled whether or not the
  // account exists.
  const limits = loginLimits(email, clientIp(request.headers));
  if (await isThrottled(limits)) throw new TooManyAttempts();

  const user = await db.user.findUnique({ where: { email } });
  // Only accounts provisioned with a password may use this path;
  // disabled accounts can't sign in.
  const valid =
    !!user?.passwordHash &&
    !user.disabledAt &&
    (await bcrypt.compare(password, user.passwordHash));
  if (!user || !valid) {
    await recordAttempt(limits);
    return null;
  }
  await clearAttempts(limits[0].key);
  return { id: user.id, email: user.email, name: user.name };
}

/** Passkey sign-in: verifies a WebAuthn assertion (JSON in `response`). */
export async function authorizePasskey(
  credentials: Partial<Record<"response", unknown>>,
  request: Request,
) {
  if (typeof credentials?.response !== "string") return null;
  const limits = passkeyLimits(clientIp(request.headers));
  if (await isThrottled(limits)) throw new TooManyAttempts();

  let response;
  try {
    response = JSON.parse(credentials.response);
  } catch {
    return null;
  }
  const user = await verifyPasskeySignIn(response);
  if (!user || user.disabledAt) {
    await recordAttempt(limits);
    return null;
  }
  return { id: user.id, email: user.email, name: user.name };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
    Credentials({
      id: "passkey",
      name: "Passkey",
      credentials: { response: {} },
      authorize: authorizePasskey,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On sign-in, hydrate id + role from the DB (never from the client).
      if (user?.email) {
        const dbUser = await db.user.findUnique({
          where: { email: user.email.toLowerCase() },
          select: { id: true, role: true },
        });
        if (dbUser) {
          token.sub = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.role = (token.role as Role | undefined) ?? "EMPLOYEE";
      return session;
    },
  },
});
