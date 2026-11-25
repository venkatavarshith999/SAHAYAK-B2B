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
  registerGoogleBusinessAccount,
  joinAsInvitedWorker,
  handleGoogleIdToken,
  verifyGoogleIdToken,
  resolveGoogleIdentity,
  linkGoogleAccount,
  setPendingGoogleCookie,
  clearPendingGoogleCookie,
  verifyPendingGoogleToken,
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

const googleCompleteSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().min(7).max(20).optional().or(z.literal('')),
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

const googleLinkSchema = z.object({
  password: z.string().min(1).max(128)
});

function timingSafeStateEqual(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ── Google OAuth: Public Configuration Status (never leaks credentials) ──────
router.get('/google/status', (_req, res) => {
  const configured = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    !String(process.env.GOOGLE_CLIENT_ID).includes('your-google')
  );
  res.json({
    configured,
    callbackPath: '/api/auth/google/callback'
  });
});

// ── Google OAuth: Redirect (with HttpOnly State Cookie for CSRF) ──────────────
router.get('/google/redirect', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback';
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

  if (!clientId || !clientSecret || clientId.includes('your-google')) {
    return res.redirect(`${frontendOrigin}/#/login?error=google_not_configured`);
  }

  const state = crypto.randomBytes(24).toString('hex');
  res.cookie('sahayak_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || Boolean(process.env.NETLIFY),
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ── Google OAuth: Callback (Validates State & Exchanges Code Server-Side) ─────
router.get('/google/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  const expectedState = req.cookies?.sahayak_oauth_state;
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback';
  res.clearCookie('sahayak_oauth_state');

  if (oauthError) {
    const codeKey = String(oauthError) === 'access_denied' ? 'google_cancelled' : 'google_failed';
    return res.redirect(`${frontendOrigin}/#/login?error=${codeKey}`);
  }

  if (!code || !timingSafeStateEqual(String(state || ''), String(expectedState || ''))) {
    return res.redirect(`${frontendOrigin}/#/login?error=google_state_invalid`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      throw new Error(`Google token exchange failed (HTTP ${tokenRes.status}).`);
    }

    const tokens = await tokenRes.json();
    // Only id_token is verified for identity; access_token is intentionally never stored.
    if (!tokens.id_token) throw new Error('No ID token returned from Google.');

    const identity = await verifyGoogleIdToken(tokens.id_token);
    const result = await resolveGoogleIdentity(identity);

    if (result.status === 'AUTHENTICATED') {
      const user = result.user;
      if (user.status === 'REJECTED' || user.status === 'SUSPENDED') {
        await recordLoginAttempt({
          userId: user.id,
          email: user.email,
          success: false,
          method: 'GOOGLE',
          req,
          failureReason: `ACCOUNT_${user.status}`
        });
        return res.redirect(`${frontendOrigin}/#/login?error=account_suspended`);
      }

      const rawToken = await createSession(user.id, req);
      setSessionCookie(res, rawToken);
      clearPendingGoogleCookie(res);
      await recordLoginAttempt({ userId: user.id, email: user.email, success: true, method: 'GOOGLE', req });

      const pendingStatuses = new Set(['PENDING_VERIFICATION', 'INCOMPLETE_PROFILE', 'NEEDS_INFO', 'ON_HOLD']);
      if (pendingStatuses.has(user.status)) {
        return res.redirect(`${frontendOrigin}/#/pending`);
      }
      return res.redirect(`${frontendOrigin}/#/dashboard`);
    }

    if (result.status === 'LINK_REQUIRED') {
      setPendingGoogleCookie(res, {
        mode: 'LINK',
        sub: identity.sub,
        email: identity.email,
        fullName: result.profile?.fullName || identity.fullName
      });
      return res.redirect(`${frontendOrigin}/#/login?linkGoogle=1`);
    }

    // Brand-new Google user: store short-lived signed HttpOnly pending identity for role + business onboarding
    setPendingGoogleCookie(res, {
      mode: 'REGISTER',
      sub: identity.sub,
      email: identity.email,
      fullName: identity.fullName
    });
    return res.redirect(`${frontendOrigin}/#/role-select?google=1`);
  } catch (err) {
    console.error('[Google OAuth Callback Error]', err.message);
    return res.redirect(`${frontendOrigin}/#/login?error=google_failed`);
  }
});

// ── Google OAuth: Read Pending Signed Cookie (for Role Select / Link UI) ──────
router.get('/google/pending', (req, res) => {
  const pending = verifyPendingGoogleToken(req.cookies?.sahayak_google_pending);
  if (!pending) {
    return res.status(404).json({ error: 'No active Google sign-in session found. Please start Google sign-in again.' });
  }
  res.json({
    mode: pending.mode,
    email: pending.email,
    fullName: pending.fullName
  });
});

// ── Google OAuth: Clear Pending Cookie ────────────────────────────────────────
router.post('/google/cancel', (_req, res) => {
  clearPendingGoogleCookie(res);
  res.json({ ok: true });
});

// ── Google OAuth: Link Existing Password Account Securely ─────────────────────
router.post('/google/link', authLimiter, validateBody(googleLinkSchema), async (req, res) => {
  try {
    const pending = verifyPendingGoogleToken(req.cookies?.sahayak_google_pending);
    if (!pending || pending.mode !== 'LINK') {
      return res.status(401).json({ error: 'Google verification session expired. Please click Sign in with Google again.' });
    }

    const { user } = await linkGoogleAccount({
      sub: pending.sub,
      email: pending.email,
      password: req.validatedBody.password
    });

    const rawToken = await createSession(user.id, req);
    setSessionCookie(res, rawToken);
    clearPendingGoogleCookie(res);
    await recordLoginAttempt({ userId: user.id, email: user.email, success: true, method: 'GOOGLE_LINK', req });
    await writeAuditLog({
      actorId: user.id,
      action: 'GOOGLE_ACCOUNT_LINKED',
      targetType: 'User',
      targetId: user.id,
      metadata: { provider: 'google' }
    });

    res.json({ status: 'AUTHENTICATED', user: sanitizeUser(user) });
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message || 'Could not link Google account.' });
  }
});

// ── Google OAuth: Complete New Business Registration ──────────────────────────
router.post('/google/complete', authLimiter, validateBody(googleCompleteSchema), async (req, res) => {
  try {
    const pending = verifyPendingGoogleToken(req.cookies?.sahayak_google_pending);
    if (!pending || pending.mode !== 'REGISTER') {
      return res.status(401).json({ error: 'Google verification session expired. Please sign in with Google again.' });
    }

    const { user, org } = await registerGoogleBusinessAccount(
      { sub: pending.sub, email: pending.email, fullName: pending.fullName },
      req.validatedBody
    );

    const rawToken = await createSession(user.id, req);
    setSessionCookie(res, rawToken);
    clearPendingGoogleCookie(res);
    await recordLoginAttempt({ userId: user.id, email: user.email, success: true, method: 'GOOGLE_REGISTER', req });
    await writeAuditLog({
      actorId: user.id,
      action: 'BUSINESS_REGISTERED_GOOGLE',
      targetType: 'Organization',
      targetId: org.id,
      metadata: { businessType: org.businessType, portalType: org.portalType }
    });

    res.status(201).json({ status: 'AUTHENTICATED', user: sanitizeUser(user) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Google business registration failed.' });
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

    if (result.user.status === 'REJECTED' || result.user.status === 'SUSPENDED') {
      return res.status(403).json({ error: `Your account is ${result.user.status.toLowerCase()}.` });
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
