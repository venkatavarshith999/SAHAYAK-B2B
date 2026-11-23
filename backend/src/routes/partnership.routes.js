/**
 * SAHAYAK B2B — Phase D Module 1: Business Relationships & Partnership Requests
 * Supports Retailer↔Wholesaler, Retailer↔Manufacturer, Wholesaler↔Manufacturer,
 * Distributor↔Manufacturer, and Logistics partnerships with Manager review & Owner escalation.
 */

import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { hasOrgPermission } from '../config/permissions.js';
import { requireAuth, requireActiveAccount, requireOrgContext } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { writeAuditLog } from '../services/auditService.js';
import { notifyOrganization } from '../services/notifyService.js';

const router = express.Router();
router.use(requireAuth, requireActiveAccount, requireOrgContext);

const RELATIONSHIP_TYPES = [
  'RETAILER_WHOLESALER',
  'RETAILER_MANUFACTURER',
  'WHOLESALER_MANUFACTURER',
  'DISTRIBUTOR_MANUFACTURER',
  'LOGISTICS_PARTNERSHIP'
];

const createPartnershipSchema = z.object({
  targetOrgId: z.string().uuid(),
  relationshipType: z.enum(RELATIONSHIP_TYPES),
  message: z.string().max(1000).optional().or(z.literal('')),
  commercialTerms: z.string().max(1000).optional().or(z.literal(''))
});

const reviewPartnershipSchema = z.object({
  action: z.enum(['REQUEST_INFO', 'RECOMMEND_APPROVE', 'ESCALATE_TO_OWNER', 'APPROVE', 'REJECT', 'SUSPEND']),
  notes: z.string().max(1000).optional().default('')
});

// ── Discover Verified Organizations for Partnerships ──────────────────────────
router.get('/discover', async (req, res) => {
  try {
    const { search, businessType, portalType } = req.query;
    const where = {
      id: { not: req.organization.id },
      verificationStatus: 'ACTIVE'
    };
    if (businessType) where.businessType = String(businessType);
    if (portalType) where.portalType = String(portalType);
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { category: { contains: String(search), mode: 'insensitive' } },
        { city: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const organizations = await prisma.organization.findMany({
      where,
      select: {
        id: true,
        name: true,
        portalType: true,
        businessType: true,
        category: true,
        description: true,
        city: true,
        state: true,
        operatingRegions: true,
        gstVerified: true,
        verificationStatus: true
      },
      orderBy: { name: 'asc' },
      take: 80
    });
    res.json({ organizations });
  } catch {
    res.status(500).json({ error: 'Failed to discover business partners.' });
  }
});

// ── List My Organization's Partnerships (Sent + Received) ─────────────────────
router.get('/', async (req, res) => {
  try {
    const orgId = req.organization.id;
    const items = await prisma.partnershipRequest.findMany({
      where: { OR: [{ requesterOrgId: orgId }, { targetOrgId: orgId }] },
      include: {
        requesterOrg: {
          select: {
            id: true, name: true, portalType: true, businessType: true, category: true,
            city: true, state: true, gstin: true, gstVerified: true, verificationStatus: true,
            _count: { select: { documents: true } }
          }
        },
        targetOrg: {
          select: {
            id: true, name: true, portalType: true, businessType: true, category: true,
            city: true, state: true, gstVerified: true, verificationStatus: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json({
      partnerships: items,
      sent: items.filter((p) => p.requesterOrgId === orgId),
      received: items.filter((p) => p.targetOrgId === orgId),
      active: items.filter((p) => p.status === 'APPROVED')
    });
  } catch {
    res.status(500).json({ error: 'Failed to load partnerships.' });
  }
});

// ── Submit Partnership Request ────────────────────────────────────────────────
router.post('/', validateBody(createPartnershipSchema), async (req, res) => {
  try {
    const { targetOrgId, relationshipType, message, commercialTerms } = req.validatedBody;
    if (targetOrgId === req.organization.id) {
      return res.status(400).json({ error: 'Cannot submit a partnership request to your own organization.' });
    }

    const target = await prisma.organization.findFirst({
      where: { id: targetOrgId, verificationStatus: 'ACTIVE' }
    });
    if (!target) return res.status(404).json({ error: 'Target verified organization not found.' });

    const existing = await prisma.partnershipRequest.findFirst({
      where: {
        OR: [
          { requesterOrgId: req.organization.id, targetOrgId },
          { requesterOrgId: targetOrgId, targetOrgId: req.organization.id }
        ],
        status: { in: ['PENDING', 'INFO_REQUESTED', 'MANAGER_RECOMMENDED', 'ESCALATED_TO_OWNER', 'APPROVED'] }
      }
    });
    if (existing) {
      return res.status(400).json({ error: `A partnership with ${target.name} already exists (status: ${existing.status}).` });
    }

    const created = await prisma.partnershipRequest.create({
      data: {
        requesterOrgId: req.organization.id,
        targetOrgId,
        relationshipType,
        message: message?.trim() || null,
        commercialTerms: commercialTerms?.trim() || null,
        status: 'PENDING',
        history: [
          {
            action: 'SUBMITTED',
            actorId: req.user.id,
            actorName: req.user.fullName,
            actorRole: req.membership.isOwner ? 'OWNER' : req.membership.workerRole,
            at: new Date().toISOString(),
            notes: message?.trim() || 'Partnership request submitted'
          }
        ]
      },
      include: {
        requesterOrg: { select: { id: true, name: true, businessType: true, city: true } },
        targetOrg: { select: { id: true, name: true, businessType: true, city: true } }
      }
    });

    await notifyOrganization({
      organizationId: targetOrgId,
      category: 'PARTNERSHIP',
      title: `New Partnership Request from ${req.organization.name}`,
      body: `${req.organization.name} (${req.organization.businessType}) requested a ${relationshipType.replace(/_/g, ' ')} partnership.`,
      includeWorkerRoles: ['BUSINESS_MANAGER', 'VERIFICATION_MANAGER']
    });

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'SUBMIT_PARTNERSHIP_REQUEST',
      targetEntity: 'PartnershipRequest',
      targetId: created.id,
      details: { targetOrgId, targetName: target.name, relationshipType }
    });

    res.status(201).json({ partnership: created });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to submit partnership request.' });
  }
});

// ── Review / Approve / Reject / Escalate Incoming Partnership Request ─────────
router.patch('/:id/review', validateBody(reviewPartnershipSchema), async (req, res) => {
  try {
    const item = await prisma.partnershipRequest.findUnique({
      where: { id: req.params.id },
      include: {
        requesterOrg: { select: { id: true, name: true } },
        targetOrg: { select: { id: true, name: true } }
      }
    });
    if (!item || item.targetOrgId !== req.organization.id) {
      return res.status(404).json({ error: 'Incoming partnership request not found for your organization.' });
    }

    const { action, notes } = req.validatedBody;
    const isOwner = req.membership.isOwner;
    const canReview = isOwner || hasOrgPermission(req.membership, 'REVIEW_PARTNERSHIPS');
    const canApprove = isOwner || hasOrgPermission(req.membership, 'APPROVE_PARTNERSHIPS');

    if (!canReview) {
      return res.status(403).json({ error: 'You do not have permission to review incoming partnership requests.' });
    }
    if (['APPROVE', 'REJECT', 'SUSPEND'].includes(action) && !canApprove) {
      return res.status(403).json({
        error: 'Your role can review, request info, or escalate to owner, but lacks final approval authority.'
      });
    }

    const statusMap = {
      REQUEST_INFO: 'INFO_REQUESTED',
      RECOMMEND_APPROVE: 'MANAGER_RECOMMENDED',
      ESCALATE_TO_OWNER: 'ESCALATED_TO_OWNER',
      APPROVE: 'APPROVED',
      REJECT: 'REJECTED',
      SUSPEND: 'SUSPENDED'
    };
    const nextStatus = statusMap[action];
    const prevHistory = Array.isArray(item.history) ? item.history : [];

    const updated = await prisma.partnershipRequest.update({
      where: { id: item.id },
      data: {
        status: nextStatus,
        reviewedById: req.user.id,
        reviewerNotes: notes || item.reviewerNotes,
        ...(action === 'REQUEST_INFO' ? { requestedInfoNote: notes || 'Additional details requested' } : {}),
        ...(['APPROVE', 'REJECT'].includes(action) ? { decidedById: req.user.id, decidedAt: new Date() } : {}),
        history: [
          ...prevHistory,
          {
            action,
            status: nextStatus,
            actorId: req.user.id,
            actorName: req.user.fullName,
            actorRole: isOwner ? 'OWNER' : req.membership.workerRole,
            notes,
            at: new Date().toISOString()
          }
        ]
      }
    });

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: `PARTNERSHIP_${action}`,
      targetEntity: 'PartnershipRequest',
      targetId: item.id,
      details: { requesterOrg: item.requesterOrg.name, nextStatus, notes }
    });

    // Notify requester on external decisions / info requests; notify own owners on escalation/recommendation
    if (['REQUEST_INFO', 'APPROVE', 'REJECT', 'SUSPEND'].includes(action)) {
      await notifyOrganization({
        organizationId: item.requesterOrgId,
        category: 'PARTNERSHIP',
        title: `Partnership ${nextStatus.replace(/_/g, ' ')}: ${item.targetOrg.name}`,
        body: notes || `${item.targetOrg.name} updated your partnership request to ${nextStatus.replace(/_/g, ' ')}.`
      });
    } else {
      await notifyOrganization({
        organizationId: item.targetOrgId,
        category: 'PARTNERSHIP',
        title: `Partnership ${action === 'ESCALATE_TO_OWNER' ? 'Escalated' : 'Recommended'} by ${req.user.fullName}`,
        body: `Request from ${item.requesterOrg.name}: ${notes || 'Ready for owner decision.'}`,
        excludeUserId: req.user.id,
        includeWorkerRoles: [] // Owner only
      });
    }

    res.json({ partnership: updated });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to review partnership request.' });
  }
});

// ── Requester Responds to Info Request ────────────────────────────────────────
router.post('/:id/respond', validateBody(z.object({ response: z.string().min(2).max(1000) })), async (req, res) => {
  const item = await prisma.partnershipRequest.findUnique({ where: { id: req.params.id } });
  if (!item || item.requesterOrgId !== req.organization.id) {
    return res.status(404).json({ error: 'Partnership request not found.' });
  }
  const prevHistory = Array.isArray(item.history) ? item.history : [];
  const updated = await prisma.partnershipRequest.update({
    where: { id: item.id },
    data: {
      status: 'PENDING',
      message: `${item.message ? item.message + '\n\n' : ''}Additional Info: ${req.validatedBody.response}`,
      history: [
        ...prevHistory,
        {
          action: 'INFO_PROVIDED',
          actorId: req.user.id,
          actorName: req.user.fullName,
          notes: req.validatedBody.response,
          at: new Date().toISOString()
        }
      ]
    }
  });
  await notifyOrganization({
    organizationId: item.targetOrgId,
    category: 'PARTNERSHIP',
    title: `Additional Partnership Info from ${req.organization.name}`,
    body: req.validatedBody.response,
    includeWorkerRoles: ['BUSINESS_MANAGER', 'VERIFICATION_MANAGER']
  });
  res.json({ partnership: updated });
});

export default router;
