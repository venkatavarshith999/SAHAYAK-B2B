import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { ADMIN_ROLES, isAdminRole, hasPlatformPermission } from '../config/permissions.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { hashPassword } from '../auth/authService.js';
import { writeAuditLog } from '../services/auditService.js';

const router = express.Router();

const STAFF_ADMIN_ROLES = [
  'SUPER_ADMIN',
  'VERIFICATION_ADMIN',
  'FINANCE_ADMIN',
  'OPERATIONS_ADMIN',
  'SUPPORT_ADMIN',
  'LOGISTICS_ADMIN'
];

const createAdminSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().max(160),
  password: z.string().min(8).max(128),
  role: z.enum(STAFF_ADMIN_ROLES)
});

// Every route under /api/admin requires an authenticated ACTIVE admin role
router.use(requireAuth, requireAdmin);

// ── Platform Overview Stats ───────────────────────────────────────────────────
router.get('/stats', requirePermission('VIEW_ADMIN'), async (_req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      pendingVerification,
      totalOrganizations,
      verifiedOrganizations,
      workersCount,
      roleBreakdown,
      businessTypeBreakdown
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.businessVerification.count({ where: { status: { in: ['PENDING_VERIFICATION', 'NEEDS_INFO', 'ON_HOLD'] } } }),
      prisma.organization.count(),
      prisma.organization.count({ where: { verificationStatus: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'WORKER' } }),
      prisma.user.groupBy({ by: ['role'], _count: { role: true } }),
      prisma.organization.groupBy({ by: ['businessType'], _count: { businessType: true } })
    ]);

    res.json({
      totalUsers,
      activeUsers,
      pendingVerification,
      activeBusinesses: totalOrganizations,
      verifiedBusinesses: verifiedOrganizations,
      workersCount,
      roleBreakdown: Object.fromEntries(roleBreakdown.map((r) => [r.role, r._count.role])),
      businessTypeBreakdown: Object.fromEntries(businessTypeBreakdown.map((b) => [b.businessType, b._count.businessType]))
    });
  } catch {
    res.status(500).json({ error: 'Failed to load admin statistics.' });
  }
});

// ── User Management ───────────────────────────────────────────────────────────
router.get('/users', requirePermission('VIEW_ADMIN'), async (req, res) => {
  try {
    const { role, status, search, page = '1', limit = '25' } = req.query;
    const take = Math.min(Number(limit) || 25, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where = {};
    if (role) where.role = String(role);
    if (status) where.status = String(status);
    if (search) {
      where.OR = [
        { email: { contains: String(search), mode: 'insensitive' } },
        { fullName: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          businessProfile: { select: { businessName: true, city: true, gstin: true, gstVerified: true } },
          memberships: { include: { organization: { select: { id: true, name: true, businessType: true } } } }
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        phone: u.phone,
        role: u.role,
        status: u.status,
        emailVerified: u.emailVerified,
        createdAt: u.createdAt,
        businessProfile: u.businessProfile,
        organization: u.memberships?.[0]?.organization || null,
        workerRole: u.memberships?.[0]?.workerRole || null
      })),
      pagination: { page: Number(page) || 1, limit: take, total, pages: Math.ceil(total / take) }
    });
  } catch {
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

router.patch('/users/:id/status', requirePermission('*'), async (req, res) => {
  try {
    const { status, reason } = req.body;
    const validStatuses = ['ACTIVE', 'SUSPENDED', 'REJECTED', 'ON_HOLD'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own account status.' });

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { status }
    });

    await writeAuditLog({
      actorId: req.user.id,
      action: `${status}_USER`,
      targetEntity: 'User',
      targetId: req.params.id,
      details: { reason: reason || '', newStatus: status }
    });

    if (status === 'SUSPENDED') {
      await prisma.userSession.updateMany({
        where: { userId: req.params.id, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    res.json({ id: updated.id, status: updated.status });
  } catch {
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

router.get('/users/:id/login-history', requirePermission('VIEW_ADMIN'), async (req, res) => {
  try {
    const history = await prisma.loginHistory.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 30
    });
    res.json({ history });
  } catch {
    res.status(500).json({ error: 'Failed to load user login history.' });
  }
});

// ── Business Verification Center ──────────────────────────────────────────────
router.get('/verifications', requirePermission('VIEW_KYC'), async (req, res) => {
  try {
    const reqStatus = req.query.status ? String(req.query.status).toUpperCase() : '';
    const where =
      reqStatus === 'ALL'
        ? {}
        : reqStatus
          ? { status: reqStatus }
          : { status: { in: ['PENDING_VERIFICATION', 'NEEDS_INFO', 'ON_HOLD'] } };

    const verifications = await prisma.businessVerification.findMany({
      where,
      include: {
        business: {
          include: {
            user: { select: { id: true, email: true, phone: true, fullName: true, role: true, emailVerified: true, phoneVerified: true, createdAt: true } }
          }
        },
        documents: true
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(verifications);
  } catch {
    res.status(500).json({ error: 'Failed to load verification queue.' });
  }
});

async function handleVerificationDecision(req, res, { nextStatus, actionName, notifTitle, notifBody, verifyFlags = false }) {
  try {
    const { notes, riskFlags } = req.body || {};
    const verification = await prisma.businessVerification.findUnique({
      where: { id: req.params.id },
      include: {
        business: {
          include: {
            user: { select: { id: true, email: true, role: true, status: true } }
          }
        }
      }
    });
    if (!verification || !verification.business || !verification.business.user) {
      return res.status(404).json({ error: 'Verification record not found.' });
    }

    const applicant = verification.business.user;
    if (applicant.id === req.user.id) {
      return res.status(403).json({ error: 'Administrators cannot review or approve their own verification request.' });
    }
    if (isAdminRole(applicant.role)) {
      return res.status(403).json({ error: 'Administrative accounts cannot be modified through business verification approval.' });
    }

    const previousStatus = verification.status;
    const reviewedAt = new Date();
    const prevHistory = Array.isArray(verification.history) ? verification.history : [];
    const newHistory = [
      ...prevHistory,
      {
        action: actionName,
        decision: nextStatus,
        previousStatus,
        status: nextStatus,
        applicantUserId: applicant.id,
        organizationId: verification.business.organizationId || null,
        reviewerId: req.user.id,
        reviewerEmail: req.user.email,
        notes: notes || '',
        at: reviewedAt.toISOString()
      }
    ];

    // Atomic update strictly scoped to the target applicant's verification status.
    // NEVER modifies applicant User.role, Organization.businessType, Organization.portalType, or admin session.
    const txOps = [
      prisma.businessVerification.update({
        where: { id: verification.id },
        data: {
          status: nextStatus,
          reviewerId: req.user.id,
          reviewerNotes: notes || null,
          riskFlags: riskFlags !== undefined ? riskFlags : verification.riskFlags,
          history: newHistory,
          reviewedAt
        }
      }),
      prisma.user.update({
        where: { id: applicant.id },
        data: { status: nextStatus }
      })
    ];

    if (verifyFlags) {
      txOps.push(
        prisma.businessProfile.update({
          where: { id: verification.businessId },
          data: { gstVerified: Boolean(verification.business.gstin) }
        })
      );
    }

    if (verification.business.organizationId) {
      txOps.push(
        prisma.organization.update({
          where: { id: verification.business.organizationId },
          data: {
            verificationStatus: nextStatus,
            ...(verifyFlags
              ? {
                  gstVerified: Boolean(verification.business.gstin),
                  identityVerified: true,
                  documentsVerified: true
                }
              : {})
          }
        })
      );
    }

    await prisma.$transaction(txOps);

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: verification.business.organizationId || null,
      action: actionName,
      targetEntity: 'BusinessVerification',
      targetId: verification.id,
      details: {
        applicantUserId: applicant.id,
        applicantEmail: applicant.email,
        applicantRole: applicant.role,
        applicantBusinessType: verification.business.businessType || applicant.role,
        organizationId: verification.business.organizationId || null,
        businessName: verification.business.businessName,
        previousStatus,
        newStatus: nextStatus,
        decision: actionName,
        notes: notes || '',
        reviewedAt: reviewedAt.toISOString()
      }
    });

    await prisma.notification.create({
      data: {
        userId: applicant.id,
        category: 'VERIFICATION',
        title: notifTitle,
        body: notifBody(notes)
      }
    }).catch(() => {});

    res.json({
      ok: true,
      verificationId: verification.id,
      previousStatus,
      status: nextStatus,
      applicant: {
        userId: applicant.id,
        role: applicant.role,
        businessType: verification.business.businessType || applicant.role,
        organizationId: verification.business.organizationId || null,
        status: nextStatus
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Verification action failed.' });
  }
}

router.post('/verifications/:id/approve', requirePermission('APPROVE_KYC'), (req, res) =>
  handleVerificationDecision(req, res, {
    nextStatus: 'ACTIVE',
    actionName: 'APPROVE_KYC',
    notifTitle: 'Business Verified ✓',
    notifBody: () => 'Your business verification has been approved. Your portal is now active.',
    verifyFlags: true
  })
);

router.post('/verifications/:id/reject', requirePermission('REJECT_KYC'), (req, res) =>
  handleVerificationDecision(req, res, {
    nextStatus: 'REJECTED',
    actionName: 'REJECT_KYC',
    notifTitle: 'Verification Not Approved',
    notifBody: (notes) => `Your business verification was rejected. Reason: ${notes || 'Please contact platform support.'}`
  })
);

router.post('/verifications/:id/request-docs', requirePermission('REQUEST_DOCS'), (req, res) =>
  handleVerificationDecision(req, res, {
    nextStatus: 'NEEDS_INFO',
    actionName: 'REQUEST_ADDITIONAL_DOCS',
    notifTitle: 'Additional Verification Documents Requested',
    notifBody: (notes) => `Our verification team requested more details: ${notes || 'Please upload supporting registration documents.'}`
  })
);

router.post('/verifications/:id/hold', requirePermission('HOLD_KYC'), (req, res) =>
  handleVerificationDecision(req, res, {
    nextStatus: 'ON_HOLD',
    actionName: 'HOLD_KYC',
    notifTitle: 'Verification Placed On Hold',
    notifBody: (notes) => `Your verification review is temporarily on hold. Notes: ${notes || 'Under compliance review.'}`
  })
);

// Unified verification decision alias (accepts verificationId OR businessProfileId)
router.post('/verifications/:id/decision', async (req, res) => {
  const decision = String(req.body?.decision || '').toUpperCase();
  const map = {
    ACTIVE: {
      perm: 'APPROVE_KYC',
      opts: {
        nextStatus: 'ACTIVE',
        actionName: 'APPROVE_KYC',
        notifTitle: 'Business Verified ✓',
        notifBody: () => 'Your business verification has been approved. Your portal is now active.',
        verifyFlags: true
      }
    },
    REJECTED: {
      perm: 'REJECT_KYC',
      opts: {
        nextStatus: 'REJECTED',
        actionName: 'REJECT_KYC',
        notifTitle: 'Verification Not Approved',
        notifBody: (notes) => `Your business verification was rejected. Reason: ${notes || 'Please contact platform support.'}`
      }
    },
    NEEDS_INFO: {
      perm: 'REQUEST_DOCS',
      opts: {
        nextStatus: 'NEEDS_INFO',
        actionName: 'REQUEST_ADDITIONAL_DOCS',
        notifTitle: 'Additional Verification Documents Requested',
        notifBody: (notes) => `Our verification team requested more details: ${notes || 'Please upload supporting registration documents.'}`
      }
    },
    ON_HOLD: {
      perm: 'HOLD_KYC',
      opts: {
        nextStatus: 'ON_HOLD',
        actionName: 'HOLD_KYC',
        notifTitle: 'Verification Placed On Hold',
        notifBody: (notes) => `Your verification review is temporarily on hold. Notes: ${notes || 'Under compliance review.'}`
      }
    }
  };

  const entry = map[decision];
  if (!entry) return res.status(400).json({ error: 'Invalid verification decision.' });
  if (!hasPlatformPermission(req.user.role, entry.perm)) {
    return res.status(403).json({ error: 'Insufficient role permissions.' });
  }

  const byId = await prisma.businessVerification.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!byId) {
    const byBiz = await prisma.businessVerification.findUnique({ where: { businessId: req.params.id }, select: { id: true } });
    if (byBiz) req.params.id = byBiz.id;
  }
  return handleVerificationDecision(req, res, entry.opts);
});

// ── AI Health & Usage Monitoring ──────────────────────────────────────────────
router.get('/ai-usage', requirePermission('VIEW_ADMIN'), async (_req, res) => {
  try {
    const [totals, failedCount, recent] = await Promise.all([
      prisma.aiUsage.aggregate({
        _count: { id: true },
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
        _avg: { latencyMs: true }
      }),
      prisma.aiUsage.count({ where: { success: false } }),
      prisma.aiUsage.findMany({
        include: { user: { select: { email: true, fullName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30
      })
    ]);

    res.json({
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      totalRequests: totals._count.id,
      failedRequests: failedCount,
      promptTokens: totals._sum.promptTokens || 0,
      completionTokens: totals._sum.completionTokens || 0,
      totalTokens: totals._sum.totalTokens || 0,
      avgLatencyMs: Math.round(totals._avg.latencyMs || 0),
      recent
    });
  } catch {
    res.status(500).json({ error: 'Failed to load AI usage metrics.' });
  }
});

// ── Admin Staff Management (Super Admin Only for Mutations) ───────────────────
router.get('/admins', requirePermission('VIEW_ADMIN'), async (_req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: Array.from(ADMIN_ROLES) } },
      select: { id: true, email: true, fullName: true, role: true, status: true, emailVerified: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ admins, availableRoles: STAFF_ADMIN_ROLES });
  } catch {
    res.status(500).json({ error: 'Failed to load admin staff.' });
  }
});

router.post('/admins', requirePermission('*'), validateBody(createAdminSchema), async (req, res) => {
  try {
    const { fullName, email, password, role } = req.validatedBody;
    const cleanEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });

    const passwordHash = await hashPassword(password);
    const created = await prisma.user.create({
      data: {
        email: cleanEmail,
        fullName: fullName.trim(),
        passwordHash,
        role,
        status: 'ACTIVE',
        emailVerified: true
      },
      select: { id: true, email: true, fullName: true, role: true, status: true, createdAt: true }
    });

    await writeAuditLog({
      actorId: req.user.id,
      action: 'CREATE_ADMIN_STAFF',
      targetEntity: 'User',
      targetId: created.id,
      details: { email: cleanEmail, role }
    });

    res.status(201).json({ admin: created });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create admin staff.' });
  }
});

router.patch('/admins/:id/role', requirePermission('*'), validateBody(z.object({ role: z.enum(STAFF_ADMIN_ROLES) })), async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own admin role.' });
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || !ADMIN_ROLES.has(target.role)) {
      return res.status(404).json({ error: 'Admin staff member not found.' });
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { role: req.validatedBody.role },
      select: { id: true, email: true, fullName: true, role: true, status: true }
    });

    await writeAuditLog({
      actorId: req.user.id,
      action: 'UPDATE_ADMIN_ROLE',
      targetEntity: 'User',
      targetId: target.id,
      details: { previousRole: target.role, newRole: updated.role }
    });

    res.json({ admin: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update admin role.' });
  }
});

// ── Organizations & Logistics Partners Directory ──────────────────────────────
router.get('/organizations', requirePermission('VIEW_ADMIN'), async (req, res) => {
  try {
    const { portalType, businessType, status, search } = req.query;
    const where = {};
    if (portalType) where.portalType = String(portalType);
    if (businessType) where.businessType = String(businessType);
    if (status) where.verificationStatus = String(status);
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { city: { contains: String(search), mode: 'insensitive' } },
        { gstin: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const organizations = await prisma.organization.findMany({
      where,
      include: {
        _count: { select: { memberships: true, branches: true, products: true, vehicles: true, shipments: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ organizations });
  } catch {
    res.status(500).json({ error: 'Failed to load organizations.' });
  }
});

router.get('/logistics-partners', requirePermission('VIEW_ADMIN'), async (_req, res) => {
  try {
    const partners = await prisma.organization.findMany({
      where: { portalType: 'LOGISTICS' },
      include: {
        _count: { select: { memberships: true, branches: true, vehicles: true, shipments: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ partners });
  } catch {
    res.status(500).json({ error: 'Failed to load logistics partners.' });
  }
});

// ── Live Orders / Transactions & Partnerships Overview (Read-Only Governance) ─
router.get('/orders', requirePermission('VIEW_ADMIN'), async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        buyerOrg: { select: { id: true, name: true, city: true } },
        sellerOrg: { select: { id: true, name: true, city: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    const gmv = orders.filter((o) => o.status !== 'CANCELLED').reduce((acc, o) => acc + o.totalAmount, 0);
    res.json({
      orders,
      summary: {
        totalOrders: orders.length,
        completedOrders: orders.filter((o) => ['DELIVERED', 'RECEIPT_CONFIRMED'].includes(o.status)).length,
        cancelledOrders: orders.filter((o) => o.status === 'CANCELLED').length,
        gmv: Math.round(gmv * 100) / 100
      }
    });
  } catch {
    res.status(500).json({ error: 'Failed to load platform orders.' });
  }
});

router.get('/partnerships', requirePermission('VIEW_ADMIN'), async (_req, res) => {
  try {
    const partnerships = await prisma.partnershipRequest.findMany({
      include: {
        requesterOrg: { select: { id: true, name: true, businessType: true, city: true } },
        targetOrg: { select: { id: true, name: true, businessType: true, city: true } }
      },
      orderBy: { updatedAt: 'desc' },
      take: 100
    });
    res.json({ partnerships });
  } catch {
    res.status(500).json({ error: 'Failed to load partnerships.' });
  }
});

// ── Audit Logs ────────────────────────────────────────────────────────────────
router.get('/audit-logs', requirePermission('VIEW_ADMIN'), async (req, res) => {
  try {
    const { page = '1', limit = '50', action } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where = action ? { action: String(action) } : {};

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        include: { actor: { select: { id: true, email: true, fullName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take,
        skip
      }),
      prisma.adminAuditLog.count({ where })
    ]);

    res.json({ logs, pagination: { page: Number(page) || 1, limit: take, total } });
  } catch {
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

export default router;
