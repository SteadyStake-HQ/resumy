import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};

/**
 * Decide whether to negotiate TLS for the Postgres connection.
 *
 * Managed providers (Supabase, Neon, …) require SSL, while a local Postgres
 * usually does not. We honour an explicit `sslmode` in the URL and otherwise
 * default to SSL for any non-local host so a Supabase connection string works
 * even when it omits `?sslmode=require`.
 */
function shouldUseSsl(url: string) {
  if (/sslmode=disable/i.test(url)) return false;
  if (/sslmode=require/i.test(url) || /sslmode=verify/i.test(url)) return true;
  return !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(url);
}

export function getDb() {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("Please define the DATABASE_URL environment variable.");
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prismaPool = new Pool({
      connectionString,
      ssl: shouldUseSsl(connectionString)
        ? { rejectUnauthorized: false }
        : undefined,
    });
    const adapter = new PrismaPg(globalForPrisma.prismaPool);
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }

  return globalForPrisma.prisma;
}

export async function connectToDatabase() {
  const db = getDb();
  await db.$connect();
  return db;
}
