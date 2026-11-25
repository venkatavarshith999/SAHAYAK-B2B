import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;
const databaseUrl = process.env.NETLIFY_DB_URL || process.env.DATABASE_URL;

export const prisma =
  globalForPrisma.__sahayakPrisma ||
  new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__sahayakPrisma = prisma;
}
