import NextAuth, { type DefaultSession } from "next-auth";
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
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
