import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { ADMIN_ROLES } from '../config/permissions.js';
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
      include: { business: true }
    });
    if (!verification) return res.status(404).json({ error: 'Verification record not found.' });

    const prevHistory = Array.isArray(verification.history) ? verification.history : [];
    const newHistory = [
      ...prevHistory,
      {
        action: actionName,
        status: nextStatus,
        reviewerId: req.user.id,
        reviewerEmail: req.user.email,
        notes: notes || '',
        at: new Date().toISOString()
      }
    ];

    const txOps = [
      prisma.businessVerification.update({
        where: { id: req.params.id },
        data: {
          status: nextStatus,
          reviewerId: req.user.id,
          reviewerNotes: notes || null,
          riskFlags: riskFlags !== undefined ? riskFlags : verification.riskFlags,
          history: newHistory,
          reviewedAt: new Date()
        }
      }),
      prisma.user.update({
        where: { id: verification.business.userId },
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
      targetId: req.params.id,
      details: { businessName: verification.business.businessName, notes: notes || '', nextStatus }
    });

    await prisma.notification.create({
      data: {
        userId: verification.business.userId,
        category: 'VERIFICATION',
        title: notifTitle,
        body: notifBody(notes)
      }
    }).catch(() => {});

    res.json({ ok: true, status: nextStatus });
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
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
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
