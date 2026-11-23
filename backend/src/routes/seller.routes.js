/**
 * SAHAYAK B2B — Unified Seller Portal API (Wholesaler, Manufacturer, Distributor, Supplier)
 * Strictly isolated to organizations with portalType === 'SELLER'.
 */

import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth, requireActiveAccount, requireOrgContext } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { writeAuditLog } from '../services/auditService.js';

const router = express.Router();

router.use(requireAuth, requireActiveAccount, requireOrgContext, (req, res, next) => {
  if (req.organization.portalType !== 'SELLER') {
    return res.status(403).json({ error: 'Seller portal access requires a Wholesaler, Manufacturer, Distributor, or Supplier organization.' });
  }
  next();
});

const createProductSchema = z.object({
  sku: z.string().min(2).max(60),
  name: z.string().min(2).max(160),
  category: z.string().min(2).max(100),
  brand: z.string().max(80).optional().or(z.literal('')),
  description: z.string().max(1000).optional().or(z.literal('')),
  unit: z.string().min(1).max(30).default('unit'),
  moq: z.coerce.number().int().min(1).default(1),
  unitPrice: z.coerce.number().positive(),
  bulkPrice: z.coerce.number().positive().optional().nullable(),
  bulkMinQty: z.coerce.number().int().min(1).optional().nullable(),
  stockQty: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(10)
});

const updateProductSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  unitPrice: z.coerce.number().positive().optional(),
  bulkPrice: z.coerce.number().positive().optional().nullable(),
  stockQty: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});

const createProductionSchema = z.object({
  orderNumber: z.string().min(2).max(40),
  productName: z.string().min(2).max(160),
  targetQty: z.coerce.number().int().min(1),
  rawMaterialsNote: z.string().max(500).optional().or(z.literal('')),
  dueDate: z.string().optional().nullable()
});

const updateProductionSchema = z.object({
  completedQty: z.coerce.number().int().min(0).optional(),
  stage: z.enum(['PLANNED', 'RAW_MATERIAL', 'IN_PRODUCTION', 'QUALITY_CHECK', 'COMPLETED', 'ON_HOLD']).optional(),
  qcStatus: z.enum(['PENDING', 'PASSED', 'FAILED', 'REWORK']).optional()
});

// ── Seller Overview ───────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const orgId = req.organization.id;
    const isMfg = req.organization.businessType === 'MANUFACTURER';

    const [products, membersCount, branchesCount, docsCount, prodOrders] = await Promise.all([
      prisma.product.findMany({ where: { organizationId: orgId } }),
      prisma.organizationMembership.count({ where: { organizationId: orgId, employmentStatus: 'ACTIVE' } }),
      prisma.branch.count({ where: { organizationId: orgId } }),
      prisma.verificationDocument.count({ where: { organizationId: orgId } }),
      isMfg ? prisma.productionOrder.findMany({ where: { organizationId: orgId } }) : Promise.resolve([])
    ]);

    const activeProducts = products.filter((p) => p.isActive).length;
    const lowStockProducts = products.filter((p) => p.stockQty <= p.lowStockThreshold).length;
    const totalStockUnits = products.reduce((acc, p) => acc + p.stockQty, 0);

    res.json({
      businessType: req.organization.businessType,
      organizationName: req.organization.name,
      verificationStatus: req.organization.verificationStatus,
      stats: {
        totalProducts: products.length,
        activeProducts,
        lowStockProducts,
        totalStockUnits,
        teamMembers: membersCount,
        branches: branchesCount,
        verificationDocs: docsCount,
        ...(isMfg
          ? {
              productionOrders: prodOrders.length,
              inProduction: prodOrders.filter((o) => o.stage === 'IN_PRODUCTION' || o.stage === 'QUALITY_CHECK').length,
              completedProduction: prodOrders.filter((o) => o.stage === 'COMPLETED').length
            }
          : {})
      }
    });
  } catch {
    res.status(500).json({ error: 'Failed to load seller overview.' });
  }
});

// ── Product Catalogue CRUD ────────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  const { search, category } = req.query;
  const where = { organizationId: req.organization.id };
  if (category) where.category = String(category);
  if (search) {
    where.OR = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { sku: { contains: String(search), mode: 'insensitive' } }
    ];
  }
  const products = await prisma.product.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json({ products });
});

router.post('/products', validateBody(createProductSchema), async (req, res) => {
  try {
    const d = req.validatedBody;
    const product = await prisma.product.create({
      data: {
        organizationId: req.organization.id,
        sku: d.sku.trim().toUpperCase(),
        name: d.name.trim(),
        category: d.category.trim(),
        brand: d.brand?.trim() || null,
        description: d.description?.trim() || null,
        unit: d.unit.trim(),
        moq: d.moq,
        unitPrice: d.unitPrice,
        bulkPrice: d.bulkPrice || null,
        bulkMinQty: d.bulkMinQty || null,
        stockQty: d.stockQty,
        lowStockThreshold: d.lowStockThreshold
      }
    });
    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'CREATE_PRODUCT',
      targetEntity: 'Product',
      targetId: product.id,
      details: { sku: product.sku, name: product.name, unitPrice: product.unitPrice }
    });
    res.status(201).json({ product });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'A product with this SKU already exists in your catalogue.' });
    }
    res.status(400).json({ error: err.message || 'Failed to create product.' });
  }
});

router.patch('/products/:id', validateBody(updateProductSchema), async (req, res) => {
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, organizationId: req.organization.id } });
  if (!existing) return res.status(404).json({ error: 'Product not found in your organization.' });

  const product = await prisma.product.update({ where: { id: existing.id }, data: req.validatedBody });
  res.json({ product });
});

router.delete('/products/:id', async (req, res) => {
  const deleted = await prisma.product.deleteMany({ where: { id: req.params.id, organizationId: req.organization.id } });
  if (deleted.count === 0) return res.status(404).json({ error: 'Product not found in your organization.' });
  res.json({ ok: true });
});

// ── Manufacturer-Specific Production Orders & QC ──────────────────────────────
router.get('/production-orders', async (req, res) => {
  if (req.organization.businessType !== 'MANUFACTURER') {
    return res.status(403).json({ error: 'Production orders are available for Manufacturer organizations.' });
  }
  const orders = await prisma.productionOrder.findMany({
    where: { organizationId: req.organization.id },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ orders });
});

router.post('/production-orders', validateBody(createProductionSchema), async (req, res) => {
  if (req.organization.businessType !== 'MANUFACTURER') {
    return res.status(403).json({ error: 'Production orders are available for Manufacturer organizations.' });
  }
  try {
    const d = req.validatedBody;
    const order = await prisma.productionOrder.create({
      data: {
        organizationId: req.organization.id,
        orderNumber: d.orderNumber.trim().toUpperCase(),
        productName: d.productName.trim(),
        targetQty: d.targetQty,
        rawMaterialsNote: d.rawMaterialsNote?.trim() || null,
        dueDate: d.dueDate ? new Date(d.dueDate) : null
      }
    });
    res.status(201).json({ order });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Production order number already exists.' });
    res.status(400).json({ error: err.message || 'Failed to create production order.' });
  }
});

router.patch('/production-orders/:id', validateBody(updateProductionSchema), async (req, res) => {
  if (req.organization.businessType !== 'MANUFACTURER') {
    return res.status(403).json({ error: 'Production orders are available for Manufacturer organizations.' });
  }
  const existing = await prisma.productionOrder.findFirst({ where: { id: req.params.id, organizationId: req.organization.id } });
  if (!existing) return res.status(404).json({ error: 'Production order not found in your organization.' });

  const order = await prisma.productionOrder.update({ where: { id: existing.id }, data: req.validatedBody });
  res.json({ order });
});

export default router;
