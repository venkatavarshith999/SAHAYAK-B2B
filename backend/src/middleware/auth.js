import crypto from 'crypto';
import { prisma } from '../config/db.js';
import {
  hasPlatformPermission,
  hasOrgPermission,
  isAdminRole
} from '../config/permissions.js';

/**
 * Verifies HttpOnly session cookie, loads user + businessProfile + active organization membership.
 * Blocks revoked/expired sessions and SUSPENDED accounts.
 */
export async function requireAuth(req, res, next) {
  try {
    const rawToken = req.cookies?.sahayak_session;
    if (!rawToken) return res.status(401).json({ error: 'Authentication required.' });

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const session = await prisma.userSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            businessProfile: {
              include: {
                verification: {
                  include: { _count: { select: { documents: true } } }
                }
              }
            },
            memberships: {
              where: { employmentStatus: 'ACTIVE' },
              include: { organization: true, branch: true }
            }
          }
        }
      }
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Session expired or revoked.' });
    }
    if (session.user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Account is suspended.' });
    }

    req.user = session.user;
    req.sessionId = session.id;
    // Primary active organization membership (if user belongs to an organization)
    req.membership = session.user.memberships?.[0] || null;
    req.organization = req.membership?.organization || null;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid session.' });
  }
}

/**
 * Ensures the authenticated account is ACTIVE (approved/verified).
 * Blocks PENDING_VERIFICATION, NEEDS_INFO, ON_HOLD, INCOMPLETE_PROFILE, REJECTED, SUSPENDED.
 */
export function requireActiveAccount(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  if (req.user.status !== 'ACTIVE') {
    return res.status(403).json({
      error: `Account status is ${req.user.status}. Active verification is required for this action.`,
      accountStatus: req.user.status
    });
  }
  next();
}

/**
 * Enforces platform-level permission (e.g. VIEW_ADMIN, APPROVE_KYC, USE_AI, USE_KAEN).
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (hasPlatformPermission(req.user.role, permission)) return next();
    return res.status(403).json({ error: 'Insufficient role permissions.' });
  };
}

/**
 * Enforces that the caller is an administrative user (blocks buyers, sellers, logistics, workers).
 */
export function requireAdmin(req, res, next) {
  if (!req.user || !isAdminRole(req.user.role)) {
    return res.status(403).json({ error: 'Administrative privileges required.' });
  }
  if (req.user.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'Admin account is not active.' });
  }
  next();
}

/**
 * Enforces that the user belongs to an organization and attaches organization isolation context.
 */
export function requireOrgContext(req, res, next) {
  if (!req.membership || !req.organization) {
    return res.status(403).json({ error: 'Organization membership required.' });
  }
  if (req.membership.employmentStatus !== 'ACTIVE') {
    return res.status(403).json({ error: 'Your organization membership is not active.' });
  }
  next();
}

/**
 * Enforces organization-scoped permission (owners pass within their own org; workers require granted perm).
 */
export function requireOrgPermission(permission) {
  return (req, res, next) => {
    if (!req.membership || !req.organization) {
      return res.status(403).json({ error: 'Organization membership required.' });
    }
    if (hasOrgPermission(req.membership, permission)) return next();
    return res.status(403).json({ error: `Missing organization permission: ${permission}` });
  };
}

/**
 * Enforces that a target organizationId matches the caller's own organization (unless caller is an admin).
 */
export function assertSameOrganization(req, targetOrgId) {
  if (isAdminRole(req.user?.role)) return true;
  return Boolean(req.organization && req.organization.id === targetOrgId);
}
