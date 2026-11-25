import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

// On Netlify Server, point Prisma explicitly to the bundled Linux Query Engine binary
if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(thisDir, 'prisma-engines/libquery_engine-debian-openssl-3.0.x.so.node'),
    '/opt/user/netlify/server/prisma-engines/libquery_engine-debian-openssl-3.0.x.so.node',
    path.resolve(thisDir, 'prisma-engines/libquery_engine-rhel-openssl-3.0.x.so.node'),
    '/opt/user/netlify/server/prisma-engines/libquery_engine-rhel-openssl-3.0.x.so.node'
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = found;
  }
}

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
