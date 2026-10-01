import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Prisma 7 is engine-less and requires a driver adapter.
// Neon serverless (websocket) in production; plain pg for local Postgres.
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const isNeon = connectionString.includes("neon.tech");
  if (isNeon) {
    neonConfig.webSocketConstructor = ws;
    return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Singleton across dev HMR reloads. After `prisma generate` the generated
// client module (and its class) is new, so a cached client from the old one
// would lack new models; rebuild it instead of reusing it.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClass?: typeof PrismaClient;
};

const cached =
  globalForPrisma.prismaClass === PrismaClient ? globalForPrisma.prisma : undefined;

export const db = cached ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
  globalForPrisma.prismaClass = PrismaClient;
}
