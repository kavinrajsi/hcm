// Seed the first HR admin so someone can sign in and manage everything else.
// Usage: npx tsx prisma/seed.ts <email> [password]
// With a password → credentials login; without → Google SSO only.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email) {
    console.error("Usage: npx tsx prisma/seed.ts <email> [password]");
    process.exit(1);
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const passwordHash = password ? await bcrypt.hash(password, 12) : null;

  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: { role: "HR_ADMIN", ...(passwordHash ? { passwordHash } : {}) },
    create: { email: email.toLowerCase(), role: "HR_ADMIN", passwordHash },
  });
  console.log(`HR_ADMIN ready: ${user.email}`);
  await db.$disconnect();
}

main();
