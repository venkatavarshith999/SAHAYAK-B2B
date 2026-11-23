/**
 * SAHAYAK B2B — Phase D Module 2: RFQs & Multi-Supplier Quotation Comparison
 * Buyers (and procuring Sellers) create RFQs -> reach matching/directed Sellers ->
 * Sellers submit & revise Quotations -> Buyers compare total landed cost & Accept / Reject / Negotiate.
 */

import express from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth, requireActiveAccount, requireOrgContext } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { writeAuditLog } from '../services/auditService.js';
import { notifyOrganization } from '../services/notifyService.js';

const router = express.Router();
router.use(requireAuth, requireActiveAccount, requireOrgContext);

const createRfqSchema = z.object({
  title: z.string().min(3).max(180),
  productName: z.string().min(2).max(160),
  category: z.string().min(2).max(100),
  quantity: z.coerce.number().int().min(1),
  unit: z.string().min(1).max(30).default('units'),
  specifications: z.string().max(1500).optional().or(z.literal('')),
  targetMinPrice: z.coerce.number().positive().optional().nullable(),
  targetMaxPrice: z.coerce.number().positive().optional().nullable(),
  deliveryCity: z.string().min(2).max(80),
  requiredBy: z.string().optional().nullable(),
  paymentPreference: z.string().max(100).optional().or(z.literal('')),
  targetSellerOrgIds: z.array(z.string().uuid()).optional().default([])
});

const submitQuoteSchema = z.object({
  availableQty: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().positive(),
  bulkPrice: z.coerce.number().positive().optional().nullable(),
  moq: z.coerce.number().int().min(1).default(1),
  taxRatePct: z.coerce.number().min(0).max(40).default(18),
  deliveryCharge: z.coerce.number().min(0).default(0),
  estimatedDeliveryDays: z.coerce.number().int().min(1).max(180).default(7),
  paymentTerms: z.string().min(2).max(120).default('Net 15 Days'),
  validUntil: z.string().optional().nullable(),
  conditions: z.string().max(1000).optional().or(z.literal(''))
});

function computeTotalAmount({ quantity, unitPrice, bulkPrice, moq, taxRatePct, deliveryCharge }) {
  const effectiveUnit = bulkPrice && quantity >= moq ? bulkPrice : unitPrice;
  const subtotal = effectiveUnit * quantity;
  const tax = subtotal * ((taxRatePct || 0) / 100);
  return Math.round((subtotal + tax + (deliveryCharge || 0)) * 100) / 100;
}

// ── List RFQs (Role-Isolated: Buyers see own RFQs + all quotes; Sellers see targeted/matching RFQs + ONLY own quotes) ──
router.get('/', async (req, res) => {
  try {
    const orgId = req.organization.id;
    const isSeller = req.organization.portalType === 'SELLER';
    const view = String(req.query.view || (isSeller ? 'incoming' : 'outgoing'));

    if (view === 'outgoing' || !isSeller) {
      const rfqs = await prisma.rfq.findMany({
        where: { buyerOrgId: orgId },
        include: {
          quotations: {
            include: {
              sellerOrg: { select: { id: true, name: true, businessType: true, city: true, state: true, gstVerified: true } }
            },
            orderBy: { totalAmount: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      return res.json({ rfqs });
    }

    // Seller incoming RFQs: either targeted specifically to this Seller OR broadcast (empty targetSellerOrgIds)
    const allCandidateRfqs = await prisma.rfq.findMany({
      where: {
        buyerOrgId: { not: orgId },
        status: { in: ['OPEN', 'QUOTED', 'NEGOTIATING', 'AWARDED'] }
      },
      include: {
        buyerOrg: { select: { id: true, name: true, businessType: true, city: true, state: true, gstVerified: true } },
        quotations: {
          where: { sellerOrgId: orgId }, // Strict isolation: Seller NEVER sees rival sellers' quotations!
          orderBy: { updatedAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const filtered = allCandidateRfqs.filter((rfq) => {
      const targets = Array.isArray(rfq.targetSellerOrgIds) ? rfq.targetSellerOrgIds : [];
      if (targets.length === 0) return true;
      return targets.includes(orgId);
    });

    res.json({ rfqs: filtered });
  } catch {
    res.status(500).json({ error: 'Failed to load RFQs.' });
  }
});

// ── Create RFQ (Buyer or Procuring Seller) ────────────────────────────────────
router.post('/', validateBody(createRfqSchema), async (req, res) => {
  if (req.organization.portalType === 'LOGISTICS') {
    return res.status(403).json({ error: 'Logistics organizations cannot issue product RFQs.' });
  }
  try {
    const d = req.validatedBody;
    const rfqNumber = 'RFQ-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const rfq = await prisma.rfq.create({
      data: {
        rfqNumber,
        buyerOrgId: req.organization.id,
        createdById: req.user.id,
        title: d.title.trim(),
        productName: d.productName.trim(),
        category: d.category.trim(),
        quantity: d.quantity,
        unit: d.unit.trim(),
        specifications: d.specifications?.trim() || null,
        targetMinPrice: d.targetMinPrice || null,
        targetMaxPrice: d.targetMaxPrice || null,
        deliveryCity: d.deliveryCity.trim(),
        requiredBy: d.requiredBy ? new Date(d.requiredBy) : null,
        paymentPreference: d.paymentPreference?.trim() || null,
        targetSellerOrgIds: d.targetSellerOrgIds || []
      }
    });

    // Notify targeted sellers (or active matching category sellers if broadcast)
    const sellerIdsToNotify = d.targetSellerOrgIds?.length
      ? d.targetSellerOrgIds
      : (
          await prisma.organization.findMany({
            where: {
              portalType: 'SELLER',
              verificationStatus: 'ACTIVE',
              id: { not: req.organization.id }
            },
            select: { id: true },
            take: 25
          })
        ).map((s) => s.id);

    await Promise.all(
      sellerIdsToNotify.map((sid) =>
        notifyOrganization({
          organizationId: sid,
          category: 'RFQ',
          title: `New RFQ ${rfqNumber}: ${rfq.productName}`,
          body: `${req.organization.name} requested ${rfq.quantity} ${rfq.unit} in ${rfq.deliveryCity}.`,
          includeWorkerRoles: ['BUSINESS_MANAGER', 'SALES_EXECUTIVE']
        })
      )
    );

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'CREATE_RFQ',
      targetEntity: 'Rfq',
      targetId: rfq.id,
      details: { rfqNumber, productName: rfq.productName, quantity: rfq.quantity, targetSellers: sellerIdsToNotify.length }
    });

    res.status(201).json({ rfq });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create RFQ.' });
  }
});

router.patch('/:id/cancel', async (req, res) => {
  const existing = await prisma.rfq.findFirst({ where: { id: req.params.id, buyerOrgId: req.organization.id } });
  if (!existing) return res.status(404).json({ error: 'RFQ not found in your organization.' });
  if (existing.status === 'AWARDED') return res.status(400).json({ error: 'Cannot cancel an awarded RFQ.' });

  const rfq = await prisma.rfq.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } });
  res.json({ rfq });
});

// ── Seller Submits Quotation on an RFQ ────────────────────────────────────────
router.post('/:id/quotations', validateBody(submitQuoteSchema), async (req, res) => {
  if (req.organization.portalType !== 'SELLER') {
    return res.status(403).json({ error: 'Only Seller organizations can submit quotations.' });
  }
  try {
    const rfq = await prisma.rfq.findUnique({ where: { id: req.params.id } });
    if (!rfq || !['OPEN', 'QUOTED', 'NEGOTIATING'].includes(rfq.status)) {
      return res.status(404).json({ error: 'Open RFQ not found.' });
    }
    if (rfq.buyerOrgId === req.organization.id) {
      return res.status(400).json({ error: 'Cannot submit a quotation on your own RFQ.' });
    }
    const targets = Array.isArray(rfq.targetSellerOrgIds) ? rfq.targetSellerOrgIds : [];
    if (targets.length > 0 && !targets.includes(req.organization.id)) {
      return res.status(403).json({ error: 'This RFQ is directed to specific suppliers.' });
    }

    const d = req.validatedBody;
    const totalAmount = computeTotalAmount({
      quantity: rfq.quantity,
      unitPrice: d.unitPrice,
      bulkPrice: d.bulkPrice,
      moq: d.moq,
      taxRatePct: d.taxRatePct,
      deliveryCharge: d.deliveryCharge
    });

    const quoteNumber = 'QT-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const quotation = await prisma.$transaction(async (tx) => {
      const q = await tx.quotation.create({
        data: {
          quoteNumber,
          rfqId: rfq.id,
          sellerOrgId: req.organization.id,
          submittedById: req.user.id,
          availableQty: d.availableQty,
          unitPrice: d.unitPrice,
          bulkPrice: d.bulkPrice || null,
          moq: d.moq,
          taxRatePct: d.taxRatePct,
          deliveryCharge: d.deliveryCharge,
          totalAmount,
          estimatedDeliveryDays: d.estimatedDeliveryDays,
          paymentTerms: d.paymentTerms,
          validUntil: d.validUntil ? new Date(d.validUntil) : new Date(Date.now() + 14 * 86400000),
          conditions: d.conditions?.trim() || null,
          status: 'SUBMITTED'
        }
      });
      if (rfq.status === 'OPEN') {
        await tx.rfq.update({ where: { id: rfq.id }, data: { status: 'QUOTED' } });
      }
      return q;
    });

    await notifyOrganization({
      organizationId: rfq.buyerOrgId,
      category: 'QUOTATION',
      title: `New Quotation ${quoteNumber} for ${rfq.rfqNumber}`,
      body: `${req.organization.name} quoted ₹${d.unitPrice}/${rfq.unit} (Total ₹${totalAmount.toLocaleString('en-IN')}).`,
      includeWorkerRoles: ['BUSINESS_MANAGER', 'PROCUREMENT_MANAGER']
    });

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'SUBMIT_QUOTATION',
      targetEntity: 'Quotation',
      targetId: quotation.id,
      details: { quoteNumber, rfqId: rfq.id, unitPrice: d.unitPrice, totalAmount }
    });

    res.status(201).json({ quotation });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to submit quotation.' });
  }
});

// ── Seller Revises Own Quotation ──────────────────────────────────────────────
router.patch('/quotations/:id', validateBody(submitQuoteSchema.partial()), async (req, res) => {
  const existing = await prisma.quotation.findFirst({
    where: { id: req.params.id, sellerOrgId: req.organization.id },
    include: { rfq: true }
  });
  if (!existing) return res.status(404).json({ error: 'Quotation not found in your organization.' });
  if (['ACCEPTED', 'REJECTED'].includes(existing.status)) {
    return res.status(400).json({ error: `Cannot revise a ${existing.status.toLowerCase()} quotation.` });
  }

  const d = req.validatedBody;
  const nextUnitPrice = d.unitPrice ?? existing.unitPrice;
  const nextBulkPrice = d.bulkPrice !== undefined ? d.bulkPrice : existing.bulkPrice;
  const nextMoq = d.moq ?? existing.moq;
  const nextTax = d.taxRatePct ?? existing.taxRatePct;
  const nextDel = d.deliveryCharge ?? existing.deliveryCharge;
  const totalAmount = computeTotalAmount({
    quantity: existing.rfq.quantity,
    unitPrice: nextUnitPrice,
    bulkPrice: nextBulkPrice,
    moq: nextMoq,
    taxRatePct: nextTax,
    deliveryCharge: nextDel
  });

  const updated = await prisma.quotation.update({
    where: { id: existing.id },
    data: {
      ...d,
      validUntil: d.validUntil ? new Date(d.validUntil) : existing.validUntil,
      revision: existing.revision + 1,
      totalAmount,
      status: 'REVISED'
    }
  });

  await notifyOrganization({
    organizationId: existing.rfq.buyerOrgId,
    category: 'QUOTATION',
    title: `Quotation Revised (Rev ${updated.revision}): ${existing.quoteNumber}`,
    body: `${req.organization.name} updated total landed quote to ₹${totalAmount.toLocaleString('en-IN')}.`,
    includeWorkerRoles: ['BUSINESS_MANAGER', 'PROCUREMENT_MANAGER']
  });

  res.json({ quotation: updated });
});

// ── Buyer Accepts Quotation ───────────────────────────────────────────────────
router.post('/quotations/:id/accept', async (req, res) => {
  const quote = await prisma.quotation.findUnique({
    where: { id: req.params.id },
    include: { rfq: true, sellerOrg: { select: { id: true, name: true } } }
  });
  if (!quote || quote.rfq.buyerOrgId !== req.organization.id) {
    return res.status(404).json({ error: 'Quotation not found for your organization.' });
  }
  if (!['SUBMITTED', 'REVISED', 'NEGOTIATING'].includes(quote.status)) {
    return res.status(400).json({ error: `Quotation is already ${quote.status}.` });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const acc = await tx.quotation.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } });
    await tx.rfq.update({ where: { id: quote.rfqId }, data: { status: 'AWARDED' } });
    return acc;
  });

  await notifyOrganization({
    organizationId: quote.sellerOrgId,
    category: 'QUOTATION',
    title: `Quotation Accepted: ${quote.quoteNumber}`,
    body: `${req.organization.name} accepted your quotation for ${quote.rfq.productName} (Total ₹${quote.totalAmount.toLocaleString('en-IN')}).`,
    includeWorkerRoles: ['BUSINESS_MANAGER', 'SALES_EXECUTIVE']
  });

  await writeAuditLog({
    actorId: req.user.id,
    organizationId: req.organization.id,
    action: 'ACCEPT_QUOTATION',
    targetEntity: 'Quotation',
    targetId: quote.id,
    details: { quoteNumber: quote.quoteNumber, sellerOrg: quote.sellerOrg.name, totalAmount: quote.totalAmount }
  });

  res.json({ quotation: updated });
});

// ── Buyer Rejects Quotation ───────────────────────────────────────────────────
router.post('/quotations/:id/reject', async (req, res) => {
  const quote = await prisma.quotation.findUnique({
    where: { id: req.params.id },
    include: { rfq: true }
  });
  if (!quote || quote.rfq.buyerOrgId !== req.organization.id) {
    return res.status(404).json({ error: 'Quotation not found for your organization.' });
  }
  const updated = await prisma.quotation.update({ where: { id: quote.id }, data: { status: 'REJECTED' } });
  await notifyOrganization({
    organizationId: quote.sellerOrgId,
    category: 'QUOTATION',
    title: `Quotation Declined: ${quote.quoteNumber}`,
    body: req.body?.reason ? `Reason: ${String(req.body.reason).slice(0, 200)}` : `${req.organization.name} declined your quotation.`
  });
  res.json({ quotation: updated });
});

export default router;
