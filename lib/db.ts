import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};

export function getDb() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("Please define the DATABASE_URL environment variable.");
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prismaPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("sslmode=require")
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
