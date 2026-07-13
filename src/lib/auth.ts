import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

function allowedDomain(email: string): boolean {
  const domains = (process.env.AUTH_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return domain !== undefined && domains.includes(domain);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Google,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }
        const user = await db.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        // Only accounts provisioned with a password may use this path.
        if (!user?.passwordHash) return null;
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const email = profile?.email ?? user.email;
        if (!email || !allowedDomain(email)) return false;
        // Auto-provision workspace users as EMPLOYEE; keep existing role.
        await db.user.upsert({
          where: { email: email.toLowerCase() },
          update: { googleId: account.providerAccountId },
          create: {
            email: email.toLowerCase(),
            name: user.name,
            googleId: account.providerAccountId,
          },
        });
      }
      return true;
    },
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
