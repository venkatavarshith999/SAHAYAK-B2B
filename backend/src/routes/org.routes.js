import express from 'express';
import fs from 'fs';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { documentUpload, resolveSafeUploadPath } from '../config/upload.js';
import { WORKER_DEFAULT_PERMISSIONS, ALL_VALID_ORG_PERMISSIONS, isAdminRole } from '../config/permissions.js';
import {
  requireAuth,
  requireActiveAccount,
  requireOrgContext,
  requireOrgPermission,
  assertSameOrganization
} from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { generateInviteCode } from '../auth/authService.js';
import { writeAuditLog } from '../services/auditService.js';

const router = express.Router();

const WORKER_ROLES = Object.keys(WORKER_DEFAULT_PERMISSIONS);

const inviteWorkerSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(120),
  workerRole: z.enum(WORKER_ROLES),
  employeeId: z.string().max(40).optional().or(z.literal('')),
  department: z.string().max(80).optional().or(z.literal('')),
  designation: z.string().max(80).optional().or(z.literal('')),
  branchId: z.string().uuid().optional().nullable(),
  permissions: z.array(z.string()).optional()
});

const branchSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(['HQ', 'BRANCH', 'STORE', 'FACTORY', 'WAREHOUSE', 'REGIONAL_OFFICE']).default('BRANCH'),
  address: z.string().min(3).max(300),
  city: z.string().min(2).max(80),
  district: z.string().max(80).optional().or(z.literal('')),
  state: z.string().min(2).max(80),
  pinCode: z.string().min(4).max(12)
});

// ── Organization Profile (Strictly Org-Isolated) ──────────────────────────────
router.get('/profile', requireAuth, requireOrgContext, async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organization.id },
      include: {
        branches: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        _count: { select: { memberships: true, documents: true, products: true, vehicles: true, shipments: true } }
      }
    });
    res.json({ organization: org, membership: req.membership });
  } catch {
    res.status(500).json({ error: 'Failed to load organization profile.' });
  }
});

const updateOrgSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  category: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  address: z.string().min(3).max(300).optional(),
  city: z.string().min(2).max(80).optional(),
  district: z.string().max(80).optional().nullable(),
  state: z.string().min(2).max(80).optional(),
  pinCode: z.string().min(4).max(12).optional(),
  operatingRegions: z.string().max(300).optional().nullable(),
  productionCapacity: z.string().max(200).optional().nullable(),
  vehicleTypes: z.string().max(200).optional().nullable()
});

router.patch('/profile', requireAuth, requireActiveAccount, requireOrgContext, validateBody(updateOrgSchema), async (req, res) => {
  if (!req.membership.isOwner) {
    return res.status(403).json({ error: 'Only the organization owner can edit legal organization profile details.' });
  }
  try {
    const data = req.validatedBody;
    const updated = await prisma.organization.update({
      where: { id: req.organization.id },
      data
    });
    // Sync BusinessProfile mirror if present
    await prisma.businessProfile.updateMany({
      where: { organizationId: req.organization.id },
      data: {
        ...(data.name ? { businessName: data.name } : {}),
        ...(data.category ? { category: data.category } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.address ? { address: data.address } : {}),
        ...(data.city ? { city: data.city } : {}),
        ...(data.district !== undefined ? { district: data.district } : {}),
        ...(data.state ? { state: data.state } : {}),
        ...(data.pinCode ? { pinCode: data.pinCode } : {}),
        ...(data.operatingRegions !== undefined ? { operatingRegions: data.operatingRegions } : {}),
        ...(data.productionCapacity !== undefined ? { productionCapacity: data.productionCapacity } : {}),
        ...(data.vehicleTypes !== undefined ? { vehicleTypes: data.vehicleTypes } : {})
      }
    });
    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'UPDATE_ORG_PROFILE',
      targetEntity: 'Organization',
      targetId: updated.id,
      details: { updatedFields: Object.keys(data) }
    });
    res.json({ organization: updated });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update organization profile.' });
  }
});

// ── Branches ──────────────────────────────────────────────────────────────────
router.get('/branches', requireAuth, requireOrgContext, async (req, res) => {
  const branches = await prisma.branch.findMany({
    where: { organizationId: req.organization.id },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }]
  });
  res.json({ branches });
});

router.post('/branches', requireAuth, requireActiveAccount, requireOrgContext, requireOrgPermission('VIEW_BRANCHES'), validateBody(branchSchema), async (req, res) => {
  if (!req.membership.isOwner && req.membership.workerRole !== 'BUSINESS_MANAGER') {
    return res.status(403).json({ error: 'Only Business Owners or Business Managers can create branches.' });
  }
  const branch = await prisma.branch.create({
    data: { ...req.validatedBody, organizationId: req.organization.id }
  });
  await writeAuditLog({
    actorId: req.user.id,
    organizationId: req.organization.id,
    action: 'CREATE_BRANCH',
    targetEntity: 'Branch',
    targetId: branch.id,
    details: { name: branch.name, type: branch.type, city: branch.city }
  });
  res.status(201).json({ branch });
});

// ── Worker Invitations (Owner / Authorized Manager ONLY) ──────────────────────
router.get('/invitations', requireAuth, requireActiveAccount, requireOrgContext, requireOrgPermission('INVITE_WORKERS'), async (req, res) => {
  const invitations = await prisma.workerInvitation.findMany({
    where: { organizationId: req.organization.id },
    include: { branch: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ invitations });
});

router.post('/invitations', requireAuth, requireActiveAccount, requireOrgContext, requireOrgPermission('INVITE_WORKERS'), validateBody(inviteWorkerSchema), async (req, res) => {
  try {
    const data = req.validatedBody;
    const email = data.email.toLowerCase().trim();

    if (data.branchId) {
      const branch = await prisma.branch.findFirst({ where: { id: data.branchId, organizationId: req.organization.id } });
      if (!branch) return res.status(400).json({ error: 'Branch does not belong to your organization.' });
    }

    let grantedPerms = WORKER_DEFAULT_PERMISSIONS[data.workerRole];
    if (data.permissions && data.permissions.length > 0) {
      const invalid = data.permissions.filter((p) => !ALL_VALID_ORG_PERMISSIONS.has(p));
      if (invalid.length > 0) {
        return res.status(400).json({ error: `Invalid or privileged permission(s) rejected: ${invalid.join(', ')}` });
      }
      grantedPerms = data.permissions;
    }

    const { raw, hash } = generateInviteCode();
    const invitation = await prisma.workerInvitation.create({
      data: {
        organizationId: req.organization.id,
        invitedById: req.user.id,
        email,
        fullName: data.fullName.trim(),
        workerRole: data.workerRole,
        employeeId: data.employeeId?.trim() || null,
        department: data.department?.trim() || null,
        designation: data.designation?.trim() || null,
        branchId: data.branchId || null,
        permissions: grantedPerms,
        codeHash: hash,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000)
      }
    });

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'INVITE_WORKER',
      targetEntity: 'WorkerInvitation',
      targetId: invitation.id,
      details: { email, workerRole: data.workerRole, department: data.department }
    });

    const inviteUrl = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/#/worker-access?code=${raw}&email=${encodeURIComponent(email)}`;
    res.status(201).json({
      invitation: { id: invitation.id, email, fullName: invitation.fullName, workerRole: invitation.workerRole, expiresAt: invitation.expiresAt },
      inviteCode: raw,
      inviteUrl
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create worker invitation.' });
  }
});

router.delete('/invitations/:id', requireAuth, requireActiveAccount, requireOrgContext, requireOrgPermission('INVITE_WORKERS'), async (req, res) => {
  const updated = await prisma.workerInvitation.updateMany({
    where: { id: req.params.id, organizationId: req.organization.id, status: 'PENDING' },
    data: { status: 'REVOKED' }
  });
  if (updated.count === 0) return res.status(404).json({ error: 'Pending invitation not found.' });
  res.json({ ok: true });
});

// ── Organization Members (Workers List) ───────────────────────────────────────
router.get('/members', requireAuth, requireOrgContext, requireOrgPermission('MANAGE_WORKERS'), async (req, res) => {
  const members = await prisma.organizationMembership.findMany({
    where: { organizationId: req.organization.id },
    include: {
      user: { select: { id: true, email: true, fullName: true, phone: true, role: true, status: true, createdAt: true } },
      branch: { select: { id: true, name: true, city: true } }
    },
    orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }]
  });
  res.json({ members });
});

router.patch('/members/:id', requireAuth, requireActiveAccount, requireOrgContext, requireOrgPermission('MANAGE_WORKERS'), async (req, res) => {
  const member = await prisma.organizationMembership.findFirst({
    where: { id: req.params.id, organizationId: req.organization.id }
  });
  if (!member) return res.status(404).json({ error: 'Member not found in your organization.' });
  if (member.isOwner) return res.status(403).json({ error: 'Cannot modify the organization owner membership here.' });

  const { workerRole, department, designation, employmentStatus, permissions, branchId } = req.body;
  const updateData = {};
  if (workerRole && WORKER_ROLES.includes(workerRole)) updateData.workerRole = workerRole;
  if (department !== undefined) updateData.department = String(department).slice(0, 80);
  if (designation !== undefined) updateData.designation = String(designation).slice(0, 80);
  if (['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(employmentStatus)) updateData.employmentStatus = employmentStatus;
  if (Array.isArray(permissions)) {
    const invalid = permissions.filter((p) => !ALL_VALID_ORG_PERMISSIONS.has(p));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Invalid or privileged permission(s) rejected: ${invalid.join(', ')}` });
    }
    updateData.permissions = permissions;
  }
  if (branchId !== undefined) updateData.branchId = branchId || null;

  const updated = await prisma.organizationMembership.update({ where: { id: member.id }, data: updateData });
  await writeAuditLog({
    actorId: req.user.id,
    organizationId: req.organization.id,
    action: 'UPDATE_WORKER_MEMBERSHIP',
    targetEntity: 'OrganizationMembership',
    targetId: member.id,
    details: updateData
  });
  res.json({ member: updated });
});

// ── Secure Document Upload & Access (Organization-Isolated + Admin Review) ────
router.get('/documents', requireAuth, requireOrgContext, async (req, res) => {
  // Owners and users with VIEW_DOCUMENTS can list org documents
  if (!req.membership.isOwner && !(req.membership.permissions || []).includes('VIEW_DOCUMENTS') && req.membership.workerRole !== 'VERIFICATION_MANAGER') {
    return res.status(403).json({ error: 'You do not have permission to view confidential organization documents.' });
  }

  const docs = await prisma.verificationDocument.findMany({
    where: { organizationId: req.organization.id },
    orderBy: { uploadedAt: 'desc' }
  });
  res.json({ documents: docs });
});

router.post('/documents', requireAuth, requireOrgContext, (req, res, next) => {
  if (!req.membership.isOwner && req.membership.workerRole !== 'BUSINESS_MANAGER') {
    return res.status(403).json({ error: 'Only Business Owners or Business Managers can upload organization verification documents.' });
  }
  documentUpload.single('file')(req, res, (err) => {
    if (err) return res.status(err.statusCode || 400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required.' });
    const docType = String(req.body.docType || 'BUSINESS_LICENSE').slice(0, 80);
    const expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;

    // Link to BusinessVerification if present
    const bp = await prisma.businessProfile.findFirst({
      where: { organizationId: req.organization.id },
      include: { verification: true }
    });

    const doc = await prisma.verificationDocument.create({
      data: {
        organizationId: req.organization.id,
        verificationId: bp?.verification?.id || null,
        docType,
        fileName: req.file.originalname.slice(0, 180),
        storageKey: req.file.filename,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        expiryDate: expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate : null
      }
    });

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'UPLOAD_VERIFICATION_DOC',
      targetEntity: 'VerificationDocument',
      targetId: doc.id,
      details: { docType, fileName: doc.fileName, sizeBytes: doc.sizeBytes }
    });

    res.status(201).json({ document: doc });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Document upload failed.' });
  }
});

router.get('/documents/:id/download', requireAuth, async (req, res) => {
  try {
    const doc = await prisma.verificationDocument.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    const isAllowed =
      isAdminRole(req.user.role) ||
      (Boolean(doc.organizationId) &&
        assertSameOrganization(req, doc.organizationId) &&
        (req.membership?.isOwner || req.membership?.workerRole === 'VERIFICATION_MANAGER' || req.membership?.workerRole === 'BUSINESS_MANAGER'));

    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied to this organization document.' });
    }

    const filePath = resolveSafeUploadPath(doc.storageKey);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Stored file missing.' });

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName.replace(/"/g, '')}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.status(500).json({ error: 'Failed to retrieve document.' });
  }
});

export default router;
