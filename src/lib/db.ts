import { PrismaClient } from "@prisma/client";

// Demo-safe default: Prisma requires DATABASE_URL at runtime.
// This prevents hard crashes if a local `.env` isn't set yet.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/trusteye?schema=public";
}

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;
