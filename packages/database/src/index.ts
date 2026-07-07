import { Prisma, PrismaClient } from "@prisma/client";

export { Prisma, PrismaClient };

export const databasePackage = "@entas/database";

const defaultLogLevels: Prisma.LogLevel[] = process.env.NODE_ENV === "production" ? ["error"] : ["query", "warn", "error"];

declare global {
  // eslint-disable-next-line no-var
  var __entasPrismaClient: PrismaClient | undefined;
}

export function createPrismaClient(options: Prisma.PrismaClientOptions = {}): PrismaClient {
  return new PrismaClient({
    log: defaultLogLevels,
    ...options
  });
}

export const prisma = globalThis.__entasPrismaClient ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__entasPrismaClient = prisma;
}

export async function assertDatabaseConnection(client: PrismaClient = prisma): Promise<void> {
  await client.$queryRaw`SELECT 1`;
}

export async function disconnectDatabase(client: PrismaClient = prisma): Promise<void> {
  await client.$disconnect();
}
