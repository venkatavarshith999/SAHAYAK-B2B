/**
 * SAHAYAK B2B — Netlify Server Entrypoint
 * Hosts the existing Express API under /api/* with Netlify Database (NETLIFY_DB_URL).
 */
import '@netlify/database';
import { onStart, onShutdown } from '@netlify/server';
import app, { bootstrapSuperAdminIfNeeded } from '../../backend/src/server.js';
import { prisma } from '../../backend/src/config/db.js';

export const config = {
  path: '/api/*'
};

onStart(async () => {
  await bootstrapSuperAdminIfNeeded();
});

onShutdown(async ({ drained }) => {
  await drained;
  await prisma.$disconnect().catch(() => {});
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`SAHAYAK B2B Netlify Server listening on port ${port}`);
});
