/**
 * SAHAYAK B2B — Modular Express API Server
 * Phase B Core Infrastructure: Auth, Worker Onboarding, Org Isolation, RBAC, Uploads, KAEN, Gemini AI
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import { prisma } from './config/db.js';
import { csrfOriginGuard } from './middleware/csrf.js';
import { requireAuth } from './middleware/auth.js';
import { sanitizeUser, hashPassword } from './auth/authService.js';

import authRoutes from './routes/auth.routes.js';
import orgRoutes from './routes/org.routes.js';
import adminRoutes from './routes/admin.routes.js';
import workerRoutes from './routes/worker.routes.js';
import sellerRoutes from './routes/seller.routes.js';
import buyerRoutes from './routes/buyer.routes.js';
import logisticsRoutes from './routes/logistics.routes.js';
import partnershipRoutes from './routes/partnership.routes.js';
import rfqRoutes from './routes/rfq.routes.js';
import chatRoutes from './routes/chat.routes.js';
import orderRoutes from './routes/order.routes.js';
import aiRoutes from './routes/ai.routes.js';
import kaenRoutes from './routes/kaen.routes.js';
import notificationRoutes from './routes/notification.routes.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

// ── Security & Parsing Middleware ─────────────────────────────────────────────
app.use(helmet());
const corsAllowedOrigins = new Set([
  process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  ...String(process.env.EXTRA_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  ...[process.env.URL, process.env.DEPLOY_PRIME_URL]
    .map((s) => (s || '').trim())
    .filter(Boolean)
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || corsAllowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(csrfOriginGuard);

// ── Health Check (includes live DB ping) ──────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      database: 'connected',
      product: 'SAHAYAK B2B',
      version: '2.1.0',
      timestamp: new Date().toISOString()
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      database: 'disconnected',
      product: 'SAHAYAK B2B',
      version: '2.1.0'
    });
  }
});

// ── Current Authenticated Session ─────────────────────────────────────────────
app.get('/api/me', requireAuth, (req, res) => {
  res.json(sanitizeUser(req.user, req.membership));
});

// ── Domain Route Modules ──────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/worker', workerRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/buyer', buyerRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/partnerships', partnershipRoutes);
app.use('/api/rfqs', rfqRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', aiRoutes);
app.use('/api/kaen', kaenRoutes);
app.use('/api/notifications', notificationRoutes);

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Unhandled Error]', err.message);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error.' });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// ── Optional Idempotent Super Admin Bootstrap (via Secret Env Vars Only) ──────
export async function bootstrapSuperAdminIfNeeded() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (!email || !password) return;

  try {
    const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    if (existing) return;

    const passwordHash = await hashPassword(password);
    await prisma.user.create({
      data: {
        email,
        fullName: process.env.BOOTSTRAP_ADMIN_NAME || 'Platform Super Admin',
        passwordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        emailVerified: true
      }
    });
    console.log('[SAHAYAK] Bootstrapped initial SUPER_ADMIN account.');
  } catch (err) {
    console.error('[SAHAYAK] Super Admin bootstrap skipped:', err.message);
  }
}

export { app };
export default app;

// ── Start Standalone Server (local dev / traditional Node host) ───────────────
if (!process.env.NETLIFY) {
  const PORT = process.env.PORT || 4000;
  bootstrapSuperAdminIfNeeded().catch(() => {});
  app.listen(PORT, () => {
    console.log('');
    console.log('  🚀 SAHAYAK B2B API v2.1.0 (Modular)');
    console.log(`  📡 Listening on http://localhost:${PORT}`);
    console.log(`  🌐 Frontend origin: ${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}`);
    console.log(`  🤖 AI Model: ${process.env.GEMINI_MODEL || 'gemini-3.8-flash'}`);
    console.log('');
  });
}
