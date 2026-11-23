import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { writeAuditLog } from '../services/auditService.js';
import {
  registerBusinessAccount,
  joinAsInvitedWorker,
  handleGoogleIdToken,
  hashPassword,
  verifyPassword,
  createSession,
  setSessionCookie,
  recordLoginAttempt,
  sanitizeUser
} from '../auth/authService.js';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many reset attempts. Try again in 1 hour.' }
});

// ── Zod Schemas ───────────────────────────────────────────────────────────────
const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().max(160),
  phone: z.string().min(7).max(20).optional().or(z.literal('')),
  password: z.string().min(8).max(128),
  role: z.string().optional(),
  businessType: z.string().optional(),
  businessName: z.string().min(2).max(160),
  category: z.string().min(2).max(100),
  description: z.string().max(1000).optional().or(z.literal('')),
  address: z.string().min(3).max(300),
  city: z.string().min(2).max(80),
  district: z.string().max(80).optional().or(z.literal('')),
  state: z.string().min(2).max(80),
  pinCode: z.string().min(4).max(12),
  gstin: z.string().max(20).optional().or(z.literal('')),
  pan: z.string().max(15).optional().or(z.literal('')),
  operatingRegions: z.string().max(300).optional().or(z.literal('')),
  productionCapacity: z.string().max(200).optional().or(z.literal('')),
  vehicleTypes: z.string().max(200).optional().or(z.literal('')),
  licenses: z.any().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const workerJoinSchema = z.object({
  inviteCode: z.string().min(6).max(40),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  phone: z.string().min(7).max(20).optional().or(z.literal(''))
});

const resetPasswordSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8).max(128)
});

// ── Business Registration ─────────────────────────────────────────────────────
router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  try {
    const { user, emailVerifyRaw } = await registerBusinessAccount(req.validatedBody);
    const rawToken = await createSession(user.id, req);
    setSessionCookie(res, rawToken);

    await recordLoginAttempt({ userId: user.id, email: user.email, success: true, method: 'REGISTER', req });

    const payload = sanitizeUser(user);
    if (process.env.NODE_ENV !== 'production') {
      // Exposed ONLY in non-production for automated testing/local dev without an SMTP server
      payload._devEmailVerifyToken = emailVerifyRaw;
    }
    res.status(201).json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Business & Admin Login ────────────────────────────────────────────────────
router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.validatedBody;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        businessProfile: true,
        memberships: {
          where: { employmentStatus: 'ACTIVE' },
          include: { organization: true, branch: true }
        }
      }
    });

    if (!user || !user.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
      await recordLoginAttempt({ userId: user?.id || null, email: normalizedEmail, success: false, method: 'PASSWORD', req, failureReason: 'INVALID_CREDENTIALS' });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (user.role === 'WORKER') {
      await recordLoginAttempt({ userId: user.id, email: normalizedEmail, success: false, method: 'PASSWORD', req, failureReason: 'USE_WORKER_PORTAL' });
      return res.status(403).json({ error: 'Worker accounts must sign in through the dedicated Worker Access portal.' });
    }
    if (user.status === 'SUSPENDED') {
      await recordLoginAttempt({ userId: user.id, email: normalizedEmail, success: false, method: 'PASSWORD', req, failureReason: 'SUSPENDED' });
      return res.status(403).json({ error: 'Account suspended. Contact platform support.' });
    }

    const rawToken = await createSession(user.id, req);
    setSessionCookie(res, rawToken);
    await recordLoginAttempt({ userId: user.id, email: normalizedEmail, success: true, method: 'PASSWORD', req });
    res.json(sanitizeUser(user));
  } catch {
    res.status(500).json({ error: 'Authentication service error.' });
  }
});

// ── Worker Login (Dedicated Worker Auth Flow) ─────────────────────────────────
router.post('/worker/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.validatedBody;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          where: { employmentStatus: 'ACTIVE' },
          include: { organization: true, branch: true }
        }
      }
    });

    if (!user || user.role !== 'WORKER' || !user.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
      await recordLoginAttempt({ userId: user?.id || null, email: normalizedEmail, success: false, method: 'WORKER_PASSWORD', req, failureReason: 'INVALID_WORKER_CREDENTIALS' });
      return res.status(401).json({ error: 'Invalid worker email or password.' });
    }
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Worker account is suspended.' });
    }
    if (!user.memberships || user.memberships.length === 0) {
      return res.status(403).json({ error: 'You do not have an active organization assignment. Contact your manager.' });
    }

    const rawToken = await createSession(user.id, req);
    setSessionCookie(res, rawToken);
    await recordLoginAttempt({ userId: user.id, email: normalizedEmail, success: true, method: 'WORKER_PASSWORD', req });
    res.json(sanitizeUser(user));
  } catch {
    res.status(500).json({ error: 'Worker authentication failed.' });
  }
});

// ── Worker Invite-Only Registration ───────────────────────────────────────────
router.post('/worker/join', authLimiter, validateBody(workerJoinSchema), async (req, res) => {
  try {
    const { user, invitation } = await joinAsInvitedWorker(req.validatedBody);
    const rawToken = await createSession(user.id, req);
    setSessionCookie(res, rawToken);

    await recordLoginAttempt({ userId: user.id, email: user.email, success: true, method: 'WORKER_INVITE', req });
    await writeAuditLog({
      actorId: user.id,
      organizationId: invitation.organizationId,
      action: 'WORKER_JOINED_ORG',
      targetEntity: 'OrganizationMembership',
      targetId: user.memberships[0]?.id || user.id,
      details: { workerRole: invitation.workerRole, department: invitation.department, invitedById: invitation.invitedById }
    });

    res.status(201).json(sanitizeUser(user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await prisma.userSession.update({ where: { id: req.sessionId }, data: { revokedAt: new Date() } });
    res.clearCookie('sahayak_session');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Logout failed.' });
  }
});

// ── Email Verification ────────────────────────────────────────────────────────
router.post('/verify-email', authLimiter, validateBody(z.object({ token: z.string().min(16) })), async (req, res) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.validatedBody.token).digest('hex');
    const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Verification link is invalid or has expired.' });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
      prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })
    ]);

    res.json({ ok: true, message: 'Email verified successfully.' });
  } catch {
    res.status(500).json({ error: 'Email verification failed.' });
  }
});

// ── Resend Email Verification ─────────────────────────────────────────────────
router.post('/resend-verification', requireAuth, forgotLimiter, async (req, res) => {
  try {
    if (req.user.emailVerified) {
      return res.json({ ok: true, message: 'Your email is already verified.' });
    }

    await prisma.emailVerificationToken.deleteMany({ where: { userId: req.user.id } });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await prisma.emailVerificationToken.create({
      data: {
        userId: req.user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000)
      }
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[SAHAYAK] Resent email verification link for ${req.user.email}: ${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/#/verify-email?token=${rawToken}`);
    }

    const resp = { ok: true, message: 'A fresh email verification link has been generated.' };
    if (process.env.NODE_ENV !== 'production') resp._devEmailVerifyToken = rawToken;
    res.json(resp);
  } catch {
    res.status(500).json({ error: 'Failed to regenerate verification email.' });
  }
});

// ── Forgot Password ───────────────────────────────────────────────────────────
router.post('/forgot-password', forgotLimiter, validateBody(z.object({ email: z.string().email() })), async (req, res) => {
  try {
    const email = req.validatedBody.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.json({ ok: true, message: 'If this email is registered, a reset link will be sent.' });
    }

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[SAHAYAK] Password reset URL for ${email}: ${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/#/reset-password?token=${rawToken}`);
    }

    const resp = { ok: true, message: 'If this email is registered, a reset link will be sent.' };
    if (process.env.NODE_ENV !== 'production') resp._devResetToken = rawToken;
    res.json(resp);
  } catch {
    res.status(500).json({ error: 'Password reset service unavailable.' });
  }
});

// ── Reset Password ────────────────────────────────────────────────────────────
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), async (req, res) => {
  try {
    const { token, password } = req.validatedBody;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
    }

    const newHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash: newHash } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
      prisma.userSession.updateMany({ where: { userId: resetToken.userId, revokedAt: null }, data: { revokedAt: new Date() } })
    ]);

    res.json({ ok: true, message: 'Password updated successfully. Please sign in with your new password.' });
  } catch {
    res.status(500).json({ error: 'Password reset failed.' });
  }
});

// ── Login History (Self) ──────────────────────────────────────────────────────
router.get('/login-history', requireAuth, async (req, res) => {
  try {
    const items = await prisma.loginHistory.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 25
    });
    res.json({ history: items });
  } catch {
    res.status(500).json({ error: 'Failed to load login history.' });
  }
});

// ── Google OAuth: Redirect (with HttpOnly State Cookie for CSRF) ──────────────
router.get('/google/redirect', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback';

  if (!clientId) {
    return res.status(503).json({ error: 'Google OAuth is not configured on this server.' });
  }

  const state = crypto.randomBytes(24).toString('hex');
  res.cookie('sahayak_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account'
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ── Google OAuth: Callback (Validates State) ──────────────────────────────────
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const expectedState = req.cookies?.sahayak_oauth_state;
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  res.clearCookie('sahayak_oauth_state');

  if (!code || !state || !expectedState || state !== expectedState) {
    return res.redirect(`${frontendOrigin}/#/login?error=google_state_invalid`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenRes.json();
    if (!tokens.id_token) throw new Error('No ID token returned from Google.');

    const result = await handleGoogleIdToken({ idToken: tokens.id_token });
    if (result.status === 'AUTHENTICATED') {
      const rawToken = await createSession(result.user.id, req);
      setSessionCookie(res, rawToken);
      await recordLoginAttempt({ userId: result.user.id, email: result.user.email, success: true, method: 'GOOGLE', req });
      return res.redirect(`${frontendOrigin}/#/dashboard`);
    }
    if (result.status === 'ROLE_SELECTION_REQUIRED') {
      const params = new URLSearchParams({
        google: '1',
        email: result.profile?.email || '',
        name: result.profile?.fullName || ''
      });
      return res.redirect(`${frontendOrigin}/#/role-select?${params.toString()}`);
    }
    return res.redirect(`${frontendOrigin}/#/login?error=account_link_required`);
  } catch (err) {
    console.error('[Google OAuth Callback Error]', err.message);
    return res.redirect(`${frontendOrigin}/#/login?error=google_failed`);
  }
});

// ── Google OAuth: ID Token (SPA flow) ─────────────────────────────────────────
router.post('/google', authLimiter, async (req, res) => {
  try {
    const { idToken, selectedRole, linkPassword } = req.body;
    if (!idToken) return res.status(400).json({ error: 'ID token is required.' });

    const result = await handleGoogleIdToken({ idToken, selectedRole, linkPassword });
    if (result.status !== 'AUTHENTICATED') {
      return res.status(200).json(result);
    }

    const rawToken = await createSession(result.user.id, req);
    setSessionCookie(res, rawToken);
    await recordLoginAttempt({ userId: result.user.id, email: result.user.email, success: true, method: 'GOOGLE', req });
    res.json({ status: 'AUTHENTICATED', user: sanitizeUser(result.user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
