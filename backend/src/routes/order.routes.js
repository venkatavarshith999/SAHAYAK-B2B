/**
 * SAHAYAK B2B — Phase D Module 5: B2B Orders & Logistics Shipment Dispatch
 * Creates official Orders from Accepted Quotations OR Dual-Confirmed KAEN Negotiations.
 * Supports full order lifecycle, cancellation, receipt confirmation, and Logistics dispatch.
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

const updateStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'PROCESSING', 'READY_FOR_DISPATCH', 'SHIPPED', 'DELIVERED', 'RECEIPT_CONFIRMED', 'CANCELLED']).optional(),
  paymentStatus: z.enum(['PENDING', 'PARTIAL', 'PAID', 'REFUNDED']).optional(),
  reason: z.string().max(400).optional().or(z.literal(''))
});

const requestShipmentSchema = z.object({
  logisticsOrgId: z.string().uuid(),
  weightKg: z.coerce.number().positive(),
  quotedAmount: z.coerce.number().positive().optional().nullable(),
  pickupDate: z.string().optional().nullable()
});

// ── List Orders for Caller's Organization (Buyer or Seller) ───────────────────
router.get('/', async (req, res) => {
  try {
    const orgId = req.organization.id;
    const orders = await prisma.order.findMany({
      where: { OR: [{ buyerOrgId: orgId }, { sellerOrgId: orgId }] },
      include: {
        buyerOrg: { select: { id: true, name: true, city: true, state: true } },
        sellerOrg: { select: { id: true, name: true, city: true, state: true } },
        quotation: { select: { id: true, quoteNumber: true } },
        shipments: {
          include: { organization: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({
      orders: orders.map((o) => ({ ...o, mySide: o.buyerOrgId === orgId ? 'BUYER' : 'SELLER' }))
    });
  } catch {
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

// ── Create Order Directly from an ACCEPTED Quotation ──────────────────────────
router.post('/from-quotation/:quotationId', async (req, res) => {
  try {
    const quote = await prisma.quotation.findUnique({
      where: { id: req.params.quotationId },
      include: { rfq: true, sellerOrg: { select: { id: true, name: true } } }
    });
    if (!quote || quote.rfq.buyerOrgId !== req.organization.id) {
      return res.status(404).json({ error: 'Accepted quotation not found for your organization.' });
    }
    if (quote.status !== 'ACCEPTED') {
      return res.status(400).json({ error: 'Quotation must be accepted before converting to an order.' });
    }

    const existing = await prisma.order.findFirst({ where: { quotationId: quote.id } });
    if (existing) return res.json({ order: existing, alreadyExists: true });

    const effectiveUnit = quote.bulkPrice && quote.rfq.quantity >= quote.moq ? quote.bulkPrice : quote.unitPrice;
    const subtotal = Math.round(effectiveUnit * quote.rfq.quantity * 100) / 100;
    const taxAmount = Math.round(subtotal * (quote.taxRatePct / 100) * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount + quote.deliveryCharge) * 100) / 100;
    const orderNumber = 'ORD-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const order = await prisma.order.create({
      data: {
        orderNumber,
        buyerOrgId: req.organization.id,
        sellerOrgId: quote.sellerOrgId,
        rfqId: quote.rfqId,
        quotationId: quote.id,
        productName: quote.rfq.productName,
        quantity: quote.rfq.quantity,
        unit: quote.rfq.unit,
        unitPrice: effectiveUnit,
        subtotal,
        taxRatePct: quote.taxRatePct,
        taxAmount,
        deliveryCharge: quote.deliveryCharge,
        totalAmount,
        deliveryCity: quote.rfq.deliveryCity,
        deliveryAddress: req.body?.deliveryAddress || req.organization.address,
        paymentTerms: quote.paymentTerms,
        status: 'NEW',
        timeline: [{ status: 'NEW', by: req.user.email, at: new Date().toISOString(), note: `Created from quotation ${quote.quoteNumber}` }]
      }
    });

    await notifyOrganization({
      organizationId: quote.sellerOrgId,
      category: 'ORDER',
      title: `New Order ${orderNumber} from ${req.organization.name}`,
      body: `${order.productName} × ${order.quantity} ${order.unit} — Total ₹${order.totalAmount.toLocaleString('en-IN')}.`,
      includeWorkerRoles: ['BUSINESS_MANAGER', 'SALES_EXECUTIVE', 'DISPATCH_STAFF']
    });

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'CREATE_ORDER_FROM_QUOTATION',
      targetEntity: 'Order',
      targetId: order.id,
      details: { orderNumber, quotationId: quote.id, totalAmount }
    });

    res.status(201).json({ order });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create order.' });
  }
});

// ── Create Order from a Dual-Confirmed AGREED KAEN Negotiation ────────────────
router.post('/from-negotiation/:sessionId', async (req, res) => {
  try {
    const session = await prisma.negotiationSession.findUnique({
      where: { id: req.params.sessionId },
      include: { quotation: true, rfq: true }
    });
    if (!session || session.buyerOrgId !== req.organization.id) {
      return res.status(404).json({ error: 'Negotiation session not found for your organization.' });
    }
    if (session.status !== 'AGREED' || !session.buyerConfirmed || !session.sellerConfirmed || !session.agreedTermsSnapshot) {
      return res.status(400).json({ error: 'Both buyer and seller must confirm the KAEN negotiation terms before creating an order.' });
    }

    const existing = await prisma.order.findFirst({ where: { negotiationSessionId: session.id } });
    if (existing) return res.json({ order: existing, alreadyExists: true });

    const snap = session.agreedTermsSnapshot;
    const taxRatePct = session.quotation?.taxRatePct ?? 18;
    const deliveryCharge = session.quotation?.deliveryCharge ?? 0;
    const subtotal = Math.round(snap.agreedUnitPrice * snap.quantity * 100) / 100;
    const taxAmount = Math.round(subtotal * (taxRatePct / 100) * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount + deliveryCharge) * 100) / 100;
    const orderNumber = 'ORD-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          orderNumber,
          buyerOrgId: session.buyerOrgId,
          sellerOrgId: session.sellerOrgId,
          rfqId: session.rfqId,
          quotationId: session.quotationId,
          negotiationSessionId: session.id,
          productName: snap.productName,
          quantity: snap.quantity,
          unit: snap.unit,
          unitPrice: snap.agreedUnitPrice,
          subtotal,
          taxRatePct,
          taxAmount,
          deliveryCharge,
          totalAmount,
          deliveryCity: session.rfq?.deliveryCity || req.organization.city,
          deliveryAddress: req.body?.deliveryAddress || req.organization.address,
          paymentTerms: snap.paymentTerms || 'Net 15 Days',
          status: 'NEW',
          timeline: [{ status: 'NEW', by: req.user.email, at: new Date().toISOString(), note: `Created from agreed KAEN negotiation` }]
        }
      });
      if (session.rfqId) {
        await tx.rfq.update({ where: { id: session.rfqId }, data: { status: 'AWARDED' } });
      }
      if (session.quotationId) {
        await tx.quotation.update({ where: { id: session.quotationId }, data: { status: 'ACCEPTED' } });
      }
      return o;
    });

    await notifyOrganization({
      organizationId: session.sellerOrgId,
      category: 'ORDER',
      title: `New KAEN-Agreed Order ${orderNumber}`,
      body: `${req.organization.name} placed order for ${order.productName} × ${order.quantity} at ₹${order.unitPrice}/${order.unit}.`,
      includeWorkerRoles: ['BUSINESS_MANAGER', 'SALES_EXECUTIVE', 'DISPATCH_STAFF']
    });

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'CREATE_ORDER_FROM_KAEN',
      targetEntity: 'Order',
      targetId: order.id,
      details: { orderNumber, negotiationSessionId: session.id, totalAmount }
    });

    res.status(201).json({ order });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create order from negotiation.' });
  }
});

// ── Update Order Status / Payment / Cancel / Confirm Receipt ──────────────────
router.patch('/:id/status', validateBody(updateStatusSchema), async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const isBuyer = order.buyerOrgId === req.organization.id;
    const isSeller = order.sellerOrgId === req.organization.id;
    if (!isBuyer && !isSeller) return res.status(403).json({ error: 'Access denied to this order.' });

    const { status, paymentStatus, reason } = req.validatedBody;
    if (order.status === 'CANCELLED') return res.status(400).json({ error: 'Cancelled orders cannot be modified.' });

    if (status === 'CANCELLED') {
      if (['SHIPPED', 'DELIVERED', 'RECEIPT_CONFIRMED'].includes(order.status)) {
        return res.status(400).json({ error: 'Cannot cancel an order that has already shipped or been delivered.' });
      }
      if (!reason?.trim()) return res.status(400).json({ error: 'A cancellation reason is required.' });
    } else if (status === 'RECEIPT_CONFIRMED') {
      if (!isBuyer) return res.status(403).json({ error: 'Only the buyer organization can confirm receipt of goods.' });
    } else if (status) {
      if (!isSeller) return res.status(403).json({ error: 'Only the seller organization can advance fulfillment stages.' });
    }

    const prevTimeline = Array.isArray(order.timeline) ? order.timeline : [];
    const nextTimeline = status
      ? [...prevTimeline, { status, by: req.user.email, at: new Date().toISOString(), note: reason || '' }]
      : prevTimeline;

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        ...(status ? { status } : {}),
        ...(paymentStatus ? { paymentStatus } : {}),
        ...(status === 'CANCELLED' ? { cancellationReason: reason.trim(), cancelledById: req.user.id } : {}),
        timeline: nextTimeline
      }
    });

    const counterparty = isBuyer ? order.sellerOrgId : order.buyerOrgId;
    await notifyOrganization({
      organizationId: counterparty,
      category: 'ORDER',
      title: `Order ${order.orderNumber} Updated: ${updated.status}`,
      body: reason ? `Notes: ${reason}` : `Payment: ${updated.paymentStatus} · Status: ${updated.status}`
    });

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: status === 'CANCELLED' ? 'CANCEL_ORDER' : 'UPDATE_ORDER_STATUS',
      targetEntity: 'Order',
      targetId: order.id,
      details: { orderNumber: order.orderNumber, status: updated.status, paymentStatus: updated.paymentStatus, reason }
    });

    res.json({ order: updated });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update order.' });
  }
});

// ── Seller Dispatches Order to a Verified Logistics Partner (Creates Shipment) ─
router.post('/:id/request-shipment', validateBody(requestShipmentSchema), async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { buyerOrg: { select: { name: true, city: true } } }
    });
    if (!order || order.sellerOrgId !== req.organization.id) {
      return res.status(404).json({ error: 'Seller order not found.' });
    }
    if (order.status === 'CANCELLED') return res.status(400).json({ error: 'Cannot ship a cancelled order.' });

    const { logisticsOrgId, weightKg, quotedAmount, pickupDate } = req.validatedBody;
    const logOrg = await prisma.organization.findFirst({
      where: { id: logisticsOrgId, portalType: 'LOGISTICS', verificationStatus: 'ACTIVE' }
    });
    if (!logOrg) return res.status(404).json({ error: 'Verified logistics partner not found.' });

    const trackingCode = 'SHP-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const prevTimeline = Array.isArray(order.timeline) ? order.timeline : [];

    const result = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          organizationId: logOrg.id,
          orderId: order.id,
          trackingCode,
          clientName: `${req.organization.name} → ${order.buyerOrg.name}`,
          originCity: req.organization.city,
          destinationCity: order.deliveryCity,
          weightKg,
          quotedAmount: quotedAmount || null,
          pickupDate: pickupDate ? new Date(pickupDate) : null,
          status: 'AWAITING_ACCEPTANCE',
          events: [{ status: 'AWAITING_ACCEPTANCE', by: req.user.email, at: new Date().toISOString(), note: `Requested for Order ${order.orderNumber}` }]
        }
      });
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'READY_FOR_DISPATCH',
          timeline: [...prevTimeline, { status: 'READY_FOR_DISPATCH', by: req.user.email, at: new Date().toISOString(), note: `Shipment ${trackingCode} requested from ${logOrg.name}` }]
        }
      });
      return { shipment, order: updatedOrder };
    });

    await notifyOrganization({
      organizationId: logOrg.id,
      category: 'SHIPMENT',
      title: `New Shipment Request ${trackingCode}`,
      body: `Order ${order.orderNumber}: ${req.organization.city} → ${order.deliveryCity} (${weightKg} kg).`,
      includeWorkerRoles: ['BUSINESS_MANAGER', 'LOGISTICS_COORDINATOR']
    });
    await notifyOrganization({
      organizationId: order.buyerOrgId,
      category: 'SHIPMENT',
      title: `Shipment Scheduled for ${order.orderNumber}`,
      body: `Tracking ${trackingCode} assigned to ${logOrg.name}.`
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to request shipment.' });
  }
});

// ── List Verified Logistics Partners for Dispatch Dropdown ────────────────────
router.get('/logistics-partners', async (_req, res) => {
  const partners = await prisma.organization.findMany({
    where: { portalType: 'LOGISTICS', verificationStatus: 'ACTIVE' },
    select: { id: true, name: true, city: true, state: true, vehicleTypes: true, operatingRegions: true },
    orderBy: { name: 'asc' }
  });
  res.json({ partners });
});

export default router;
