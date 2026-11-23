/**
 * SAHAYAK B2B — Buyer Portal API
 * Live Supplier Discovery, Product Discovery, Saved Suppliers, and Purchase Requests.
 * Strictly isolated to authenticated ACTIVE organizations with portalType === 'BUYER'.
 */

import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth, requireActiveAccount, requireOrgContext } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { writeAuditLog } from '../services/auditService.js';

const router = express.Router();

router.use(requireAuth, requireActiveAccount, requireOrgContext, (req, res, next) => {
  if (req.organization.portalType !== 'BUYER') {
    return res.status(403).json({ error: 'Buyer portal access requires a Buyer / Retailer organization.' });
  }
  next();
});

const createPrSchema = z.object({
  title: z.string().min(2).max(160),
  category: z.string().min(2).max(100),
  quantity: z.coerce.number().int().min(1),
  unit: z.string().min(1).max(30).default('units'),
  targetPrice: z.coerce.number().positive().optional().nullable(),
  deliveryCity: z.string().min(2).max(80),
  requiredBy: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().or(z.literal(''))
});

const updatePrSchema = z.object({
  status: z.enum(['OPEN', 'REVIEWED', 'CONVERTED', 'CANCELLED']).optional(),
  notes: z.string().max(1000).optional().nullable()
});

// ── Buyer Overview ────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const orgId = req.organization.id;
    const [
      verifiedSuppliers,
      liveProducts,
      savedCount,
      requests,
      teamMembers,
      branches
    ] = await Promise.all([
      prisma.organization.count({ where: { portalType: 'SELLER', verificationStatus: 'ACTIVE' } }),
      prisma.product.count({ where: { isActive: true, organization: { verificationStatus: 'ACTIVE' } } }),
      prisma.savedSupplier.count({ where: { buyerOrgId: orgId } }),
      prisma.purchaseRequest.findMany({ where: { organizationId: orgId } }),
      prisma.organizationMembership.count({ where: { organizationId: orgId, employmentStatus: 'ACTIVE' } }),
      prisma.branch.count({ where: { organizationId: orgId } })
    ]);

    res.json({
      organizationName: req.organization.name,
      city: req.organization.city,
      stats: {
        verifiedSuppliers,
        liveProducts,
        savedSuppliers: savedCount,
        openRequests: requests.filter((r) => r.status === 'OPEN').length,
        totalRequests: requests.length,
        teamMembers,
        branches
      }
    });
  } catch {
    res.status(500).json({ error: 'Failed to load buyer overview.' });
  }
});

// ── Live Supplier Discovery (Real Verified Sellers Only) ──────────────────────
router.get('/suppliers', async (req, res) => {
  try {
    const { search, businessType, city } = req.query;
    const where = { portalType: 'SELLER', verificationStatus: 'ACTIVE' };
    if (businessType) where.businessType = String(businessType);
    if (city) where.city = { contains: String(city), mode: 'insensitive' };
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { category: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const [suppliers, saved] = await Promise.all([
      prisma.organization.findMany({
        where,
        select: {
          id: true,
          name: true,
          businessType: true,
          category: true,
          description: true,
          city: true,
          state: true,
          operatingRegions: true,
          gstVerified: true,
          verificationStatus: true,
          _count: { select: { products: { where: { isActive: true } } } }
        },
        orderBy: { name: 'asc' },
        take: 100
      }),
      prisma.savedSupplier.findMany({
        where: { buyerOrgId: req.organization.id },
        select: { supplierOrgId: true }
      })
    ]);

    const savedSet = new Set(saved.map((s) => s.supplierOrgId));
    res.json({
      suppliers: suppliers.map((s) => ({
        ...s,
        productCount: s._count.products,
        isSaved: savedSet.has(s.id)
      }))
    });
  } catch {
    res.status(500).json({ error: 'Failed to load suppliers.' });
  }
});

// ── Live Product Discovery ────────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  try {
    const { search, category, maxPrice } = req.query;
    const where = {
      isActive: true,
      organization: { portalType: 'SELLER', verificationStatus: 'ACTIVE' }
    };
    if (category) where.category = { contains: String(category), mode: 'insensitive' };
    if (maxPrice && !Number.isNaN(Number(maxPrice))) where.unitPrice = { lte: Number(maxPrice) };
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { sku: { contains: String(search), mode: 'insensitive' } },
        { brand: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        organization: {
          select: { id: true, name: true, businessType: true, city: true, state: true, gstVerified: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ products });
  } catch {
    res.status(500).json({ error: 'Failed to search products.' });
  }
});

// ── Saved Suppliers ───────────────────────────────────────────────────────────
router.get('/saved-suppliers', async (req, res) => {
  const saved = await prisma.savedSupplier.findMany({
    where: { buyerOrgId: req.organization.id },
    include: {
      supplierOrg: {
        select: { id: true, name: true, businessType: true, category: true, city: true, state: true, gstVerified: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ saved });
});

router.post('/saved-suppliers', validateBody(z.object({ supplierOrgId: z.string().uuid(), notes: z.string().max(400).optional().default('') })), async (req, res) => {
  const { supplierOrgId, notes } = req.validatedBody;
  const supplier = await prisma.organization.findFirst({ where: { id: supplierOrgId, portalType: 'SELLER', verificationStatus: 'ACTIVE' } });
  if (!supplier) return res.status(404).json({ error: 'Verified supplier not found.' });

  const record = await prisma.savedSupplier.upsert({
    where: { buyerOrgId_supplierOrgId: { buyerOrgId: req.organization.id, supplierOrgId } },
    update: { notes },
    create: { buyerOrgId: req.organization.id, supplierOrgId, notes }
  });
  res.status(201).json({ saved: record });
});

router.delete('/saved-suppliers/:supplierOrgId', async (req, res) => {
  await prisma.savedSupplier.deleteMany({
    where: { buyerOrgId: req.organization.id, supplierOrgId: req.params.supplierOrgId }
  });
  res.json({ ok: true });
});

// ── Purchase Requests ─────────────────────────────────────────────────────────
router.get('/purchase-requests', async (req, res) => {
  const requests = await prisma.purchaseRequest.findMany({
    where: { organizationId: req.organization.id },
    include: { requestedBy: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ requests });
});

router.post('/purchase-requests', validateBody(createPrSchema), async (req, res) => {
  try {
    const d = req.validatedBody;
    const pr = await prisma.purchaseRequest.create({
      data: {
        organizationId: req.organization.id,
        requestedById: req.user.id,
        title: d.title.trim(),
        category: d.category.trim(),
        quantity: d.quantity,
        unit: d.unit.trim(),
        targetPrice: d.targetPrice || null,
        deliveryCity: d.deliveryCity.trim(),
        requiredBy: d.requiredBy ? new Date(d.requiredBy) : null,
        notes: d.notes?.trim() || null
      }
    });
    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'CREATE_PURCHASE_REQUEST',
      targetEntity: 'PurchaseRequest',
      targetId: pr.id,
      details: { title: pr.title, quantity: pr.quantity }
    });
    res.status(201).json({ request: pr });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create purchase request.' });
  }
});

router.patch('/purchase-requests/:id', validateBody(updatePrSchema), async (req, res) => {
  const existing = await prisma.purchaseRequest.findFirst({ where: { id: req.params.id, organizationId: req.organization.id } });
  if (!existing) return res.status(404).json({ error: 'Purchase request not found in your organization.' });

  const updated = await prisma.purchaseRequest.update({ where: { id: existing.id }, data: req.validatedBody });
  res.json({ request: updated });
});

export default router;
