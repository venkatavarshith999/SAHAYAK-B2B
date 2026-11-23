/**
 * SAHAYAK B2B — Phase D Module 3: Persistent KAEN Negotiation Engine API
 * Preserves stateless POST /api/kaen/negotiate AND adds PostgreSQL-backed multi-round sessions
 * with dual-party explicit confirmation and immutable agreedTermsSnapshot.
 */

import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth, requireActiveAccount, requireOrgContext } from '../middleware/auth.js';
import { hasPlatformPermission, hasOrgPermission } from '../config/permissions.js';
import { validateBody } from '../middleware/validate.js';
import { evaluateNegotiationRound } from '../kaen/negotiationEngine.js';
import { writeAuditLog } from '../services/auditService.js';
import { notifyOrganization } from '../services/notifyService.js';

const router = express.Router();

const kaenRoundSchema = z.object({
  round: z.number().int().min(1).max(20),
  maxRounds: z.number().int().min(1).max(20).optional().default(5),
  buyerOffer: z.number().positive(),
  buyerMaxPrice: z.number().positive().optional(),
  sellerAsk: z.number().positive(),
  sellerFloorPrice: z.number().positive(),
  quantity: z.number().int().positive()
});

const createSessionSchema = z.object({
  quotationId: z.string().uuid().optional().nullable(),
  sellerOrgId: z.string().uuid().optional().nullable(),
  productName: z.string().min(2).max(160).optional(),
  quantity: z.coerce.number().int().min(1).optional(),
  unit: z.string().max(30).optional().default('units'),
  buyerOffer: z.coerce.number().positive(),
  buyerMaxPrice: z.coerce.number().positive().optional().nullable(),
  sellerAsk: z.coerce.number().positive().optional(),
  maxRounds: z.coerce.number().int().min(2).max(10).optional().default(5),
  deliveryTerms: z.string().max(200).optional().or(z.literal('')),
  paymentTerms: z.string().max(120).optional().or(z.literal('')),
  message: z.string().max(600).optional().or(z.literal(''))
});

const submitOfferSchema = z.object({
  proposedPrice: z.coerce.number().positive(),
  proposedQty: z.coerce.number().int().min(1).optional(),
  sellerFloorPrice: z.coerce.number().positive().optional(),
  deliveryTerms: z.string().max(200).optional().or(z.literal('')),
  paymentTerms: z.string().max(120).optional().or(z.literal('')),
  message: z.string().max(600).optional().or(z.literal(''))
});

function sanitizeSessionForOrg(session, callerOrgId) {
  const isBuyer = session.buyerOrgId === callerOrgId;
  const isSeller = session.sellerOrgId === callerOrgId;
  return {
    ...session,
    // Strictly protect private reservation prices between buyer and seller!
    sellerFloorPrice: isSeller ? session.sellerFloorPrice : undefined,
    buyerMaxPrice: isBuyer ? session.buyerMaxPrice : undefined,
    mySide: isBuyer ? 'BUYER' : isSeller ? 'SELLER' : 'OBSERVER'
  };
}

// ── Preserved Stateless KAEN Round Evaluator (Backward Compatible) ────────────
router.post('/negotiate', requireAuth, requireActiveAccount, validateBody(kaenRoundSchema), (req, res) => {
  const allowed =
    hasPlatformPermission(req.user.role, 'USE_KAEN') ||
    hasOrgPermission(req.membership, 'USE_KAEN');

  if (!allowed) {
    return res.status(403).json({ error: 'Your role does not have permission to use KAEN negotiation.' });
  }
  try {
    res.json(evaluateNegotiationRound(req.validatedBody));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── List Persistent KAEN Sessions for Caller's Organization ───────────────────
router.get('/sessions', requireAuth, requireActiveAccount, requireOrgContext, async (req, res) => {
  try {
    const orgId = req.organization.id;
    const sessions = await prisma.negotiationSession.findMany({
      where: { OR: [{ buyerOrgId: orgId }, { sellerOrgId: orgId }] },
      include: {
        buyerOrg: { select: { id: true, name: true, city: true, businessType: true } },
        sellerOrg: { select: { id: true, name: true, city: true, businessType: true } },
        quotation: { select: { id: true, quoteNumber: true, taxRatePct: true, deliveryCharge: true } },
        rfq: { select: { id: true, rfqNumber: true, deliveryCity: true } },
        rounds: { orderBy: { roundNumber: 'asc' } }
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ sessions: sessions.map((s) => sanitizeSessionForOrg(s, orgId)) });
  } catch {
    res.status(500).json({ error: 'Failed to load negotiation sessions.' });
  }
});

// ── Start a Persistent KAEN Negotiation Session (from Quotation or Direct) ────
router.post('/sessions', requireAuth, requireActiveAccount, requireOrgContext, validateBody(createSessionSchema), async (req, res) => {
  try {
    const d = req.validatedBody;
    let sellerOrgId = d.sellerOrgId;
    let rfqId = null;
    let quotationId = null;
    let productName = d.productName;
    let quantity = d.quantity;
    let unit = d.unit || 'units';
    let sellerAsk = d.sellerAsk;
    let paymentTerms = d.paymentTerms || 'Net 15 Days';

    if (d.quotationId) {
      const quote = await prisma.quotation.findUnique({
        where: { id: d.quotationId },
        include: { rfq: true }
      });
      if (!quote || quote.rfq.buyerOrgId !== req.organization.id) {
        return res.status(404).json({ error: 'Quotation not found for your organization.' });
      }
      sellerOrgId = quote.sellerOrgId;
      rfqId = quote.rfqId;
      quotationId = quote.id;
      productName = quote.rfq.productName;
      quantity = d.quantity || quote.rfq.quantity;
      unit = quote.rfq.unit;
      sellerAsk = quote.bulkPrice && quantity >= quote.moq ? quote.bulkPrice : quote.unitPrice;
      paymentTerms = d.paymentTerms || quote.paymentTerms;
    }

    if (!sellerOrgId || !productName || !quantity || !sellerAsk) {
      return res.status(400).json({ error: 'Provide quotationId or sellerOrgId, productName, quantity, and sellerAsk.' });
    }
    if (sellerOrgId === req.organization.id) {
      return res.status(400).json({ error: 'Cannot negotiate with your own organization.' });
    }

    // Default initial seller floor to 90% of seller ask until seller customizes it
    const defaultFloor = Math.round(sellerAsk * 0.9 * 100) / 100;

    // Run Round 1 through preserved KAEN solver
    const kaenOut = evaluateNegotiationRound({
      round: 1,
      maxRounds: d.maxRounds,
      buyerOffer: d.buyerOffer,
      buyerMaxPrice: d.buyerMaxPrice || undefined,
      sellerAsk,
      sellerFloorPrice: defaultFloor,
      quantity
    });

    const nextSellerAsk = kaenOut.status === 'COUNTER_OFFER' ? kaenOut.counterUnitPrice : (kaenOut.status === 'ACCEPTED' ? kaenOut.agreedUnitPrice : sellerAsk);
    const nextStatus = kaenOut.status === 'ACCEPTED' ? 'AWAITING_CONFIRMATION' : kaenOut.status === 'ESCALATED_TO_HUMAN' ? 'ESCALATED_TO_HUMAN' : 'ACTIVE';

    const session = await prisma.$transaction(async (tx) => {
      const s = await tx.negotiationSession.create({
        data: {
          rfqId,
          quotationId,
          buyerOrgId: req.organization.id,
          sellerOrgId,
          productName,
          quantity,
          unit,
          round: 1,
          maxRounds: d.maxRounds,
          currentBuyerOffer: d.buyerOffer,
          currentSellerAsk: nextSellerAsk,
          sellerFloorPrice: defaultFloor,
          buyerMaxPrice: d.buyerMaxPrice || null,
          deliveryTerms: d.deliveryTerms || null,
          paymentTerms,
          status: nextStatus,
          agreedUnitPrice: kaenOut.status === 'ACCEPTED' ? kaenOut.agreedUnitPrice : null,
          agreedTotalValue: kaenOut.status === 'ACCEPTED' ? kaenOut.totalValue : null,
          expiresAt: new Date(Date.now() + 7 * 86400000),
          rounds: {
            create: {
              roundNumber: 1,
              actorOrgId: req.organization.id,
              actorUserId: req.user.id,
              actorSide: 'BUYER',
              proposedPrice: d.buyerOffer,
              proposedQty: quantity,
              deliveryTerms: d.deliveryTerms || null,
              paymentTerms,
              kaenStatus: kaenOut.status,
              kaenCounterPrice: nextSellerAsk,
              rationale: kaenOut.rationale,
              message: d.message || 'Initial negotiation offer submitted'
            }
          }
        },
        include: {
          buyerOrg: { select: { id: true, name: true, city: true } },
          sellerOrg: { select: { id: true, name: true, city: true } },
          rounds: { orderBy: { roundNumber: 'asc' } }
        }
      });

      if (quotationId) {
        await tx.quotation.update({ where: { id: quotationId }, data: { status: 'NEGOTIATING' } });
      }
      if (rfqId) {
        await tx.rfq.update({ where: { id: rfqId }, data: { status: 'NEGOTIATING' } });
      }
      return s;
    });

    await notifyOrganization({
      organizationId: sellerOrgId,
      category: 'NEGOTIATION',
      title: `KAEN Negotiation Started: ${productName}`,
      body: `${req.organization.name} offered ₹${d.buyerOffer}/${unit} for ${quantity} ${unit}. KAEN suggested ₹${nextSellerAsk}.`,
      includeWorkerRoles: ['BUSINESS_MANAGER', 'SALES_EXECUTIVE']
    });

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'START_KAEN_NEGOTIATION',
      targetEntity: 'NegotiationSession',
      targetId: session.id,
      details: { productName, quantity, buyerOffer: d.buyerOffer, kaenStatus: kaenOut.status }
    });

    res.status(201).json({ session: sanitizeSessionForOrg(session, req.organization.id), kaenOutcome: kaenOut });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to start KAEN negotiation.' });
  }
});

// ── Submit Counteroffer (Buyer or Seller) ─────────────────────────────────────
router.post('/sessions/:id/offer', requireAuth, requireActiveAccount, requireOrgContext, validateBody(submitOfferSchema), async (req, res) => {
  try {
    const session = await prisma.negotiationSession.findUnique({ where: { id: req.params.id } });
    if (!session) return res.status(404).json({ error: 'Negotiation session not found.' });

    const isBuyer = session.buyerOrgId === req.organization.id;
    const isSeller = session.sellerOrgId === req.organization.id;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ error: 'Access denied to this negotiation session.' });
    }
    if (['AGREED', 'CANCELLED', 'EXPIRED'].includes(session.status)) {
      return res.status(400).json({ error: `Cannot submit offers on a ${session.status} negotiation.` });
    }

    const d = req.validatedBody;
    const nextRound = session.round + 1;
    const qty = d.proposedQty || session.quantity;
    const deliveryTerms = d.deliveryTerms || session.deliveryTerms;
    const paymentTerms = d.paymentTerms || session.paymentTerms;

    let nextBuyerOffer = session.currentBuyerOffer;
    let nextSellerAsk = session.currentSellerAsk;
    let nextFloor = session.sellerFloorPrice;
    let nextStatus = 'ACTIVE';
    let kaenOut = null;

    if (isBuyer) {
      nextBuyerOffer = d.proposedPrice;
      kaenOut = evaluateNegotiationRound({
        round: nextRound,
        maxRounds: session.maxRounds,
        buyerOffer: nextBuyerOffer,
        buyerMaxPrice: session.buyerMaxPrice || undefined,
        sellerAsk: session.currentSellerAsk,
        sellerFloorPrice: session.sellerFloorPrice,
        quantity: qty
      });

      if (kaenOut.status === 'ACCEPTED') {
        nextSellerAsk = kaenOut.agreedUnitPrice;
        nextStatus = 'AWAITING_CONFIRMATION'; // Explicit dual-party acceptance required!
      } else if (kaenOut.status === 'ESCALATED_TO_HUMAN') {
        nextStatus = 'ESCALATED_TO_HUMAN';
      } else {
        nextSellerAsk = kaenOut.counterUnitPrice;
      }
    } else {
      // Seller submits manual counter-ask and optionally adjusts private floor
      nextSellerAsk = d.proposedPrice;
      if (d.sellerFloorPrice) nextFloor = d.sellerFloorPrice;
      if (nextSellerAsk <= session.currentBuyerOffer) {
        nextStatus = 'AWAITING_CONFIRMATION';
      }
    }

    const proposedAgreedPrice = nextStatus === 'AWAITING_CONFIRMATION'
      ? (isBuyer ? nextBuyerOffer : nextSellerAsk)
      : null;

    const updated = await prisma.negotiationSession.update({
      where: { id: session.id },
      data: {
        round: nextRound,
        quantity: qty,
        currentBuyerOffer: nextBuyerOffer,
        currentSellerAsk: nextSellerAsk,
        sellerFloorPrice: nextFloor,
        deliveryTerms,
        paymentTerms,
        status: nextStatus,
        // Reset confirmations whenever terms change
        buyerConfirmed: false,
        sellerConfirmed: false,
        agreedUnitPrice: proposedAgreedPrice,
        agreedTotalValue: proposedAgreedPrice ? Math.round(proposedAgreedPrice * qty * 100) / 100 : null,
        rounds: {
          create: {
            roundNumber: nextRound,
            actorOrgId: req.organization.id,
            actorUserId: req.user.id,
            actorSide: isBuyer ? 'BUYER' : 'SELLER',
            proposedPrice: d.proposedPrice,
            proposedQty: qty,
            deliveryTerms,
            paymentTerms,
            kaenStatus: kaenOut?.status || 'MANUAL_COUNTER',
            kaenCounterPrice: nextSellerAsk,
            rationale: kaenOut?.rationale || `Seller revised ask to ₹${nextSellerAsk}`,
            message: d.message || null
          }
        }
      },
      include: {
        buyerOrg: { select: { id: true, name: true, city: true } },
        sellerOrg: { select: { id: true, name: true, city: true } },
        rounds: { orderBy: { roundNumber: 'asc' } }
      }
    });

    const counterpartyOrgId = isBuyer ? session.sellerOrgId : session.buyerOrgId;
    await notifyOrganization({
      organizationId: counterpartyOrgId,
      category: 'NEGOTIATION',
      title: `Round ${nextRound} Counteroffer: ${session.productName}`,
      body: `${req.organization.name} proposed ₹${d.proposedPrice}/${session.unit} (${qty} ${session.unit}). Status: ${nextStatus}.`
    });

    res.json({ session: sanitizeSessionForOrg(updated, req.organization.id), kaenOutcome: kaenOut });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to submit counteroffer.' });
  }
});

// ── Explicit Dual-Party Confirmation (Locks Immutable Agreed Terms Snapshot) ──
router.post('/sessions/:id/confirm', requireAuth, requireActiveAccount, requireOrgContext, async (req, res) => {
  try {
    const session = await prisma.negotiationSession.findUnique({
      where: { id: req.params.id },
      include: {
        buyerOrg: { select: { id: true, name: true } },
        sellerOrg: { select: { id: true, name: true } }
      }
    });
    if (!session) return res.status(404).json({ error: 'Negotiation session not found.' });

    const isBuyer = session.buyerOrgId === req.organization.id;
    const isSeller = session.sellerOrgId === req.organization.id;
    if (!isBuyer && !isSeller) return res.status(403).json({ error: 'Access denied.' });
    if (['CANCELLED', 'EXPIRED'].includes(session.status)) {
      return res.status(400).json({ error: `Session is ${session.status}.` });
    }
    if (session.status === 'AGREED') {
      return res.json({ session: sanitizeSessionForOrg(session, req.organization.id) });
    }

    const finalUnitPrice = session.agreedUnitPrice || session.currentSellerAsk;
    const finalTotalValue = Math.round(finalUnitPrice * session.quantity * 100) / 100;
    const nextBuyerConfirmed = isBuyer ? true : session.buyerConfirmed;
    const nextSellerConfirmed = isSeller ? true : session.sellerConfirmed;
    const bothConfirmed = nextBuyerConfirmed && nextSellerConfirmed;

    const snapshot = bothConfirmed
      ? {
          lockedAt: new Date().toISOString(),
          productName: session.productName,
          quantity: session.quantity,
          unit: session.unit,
          agreedUnitPrice: finalUnitPrice,
          agreedTotalValue: finalTotalValue,
          deliveryTerms: session.deliveryTerms || 'Standard Delivery',
          paymentTerms: session.paymentTerms || 'Net 15 Days',
          buyerOrgId: session.buyerOrgId,
          buyerOrgName: session.buyerOrg.name,
          sellerOrgId: session.sellerOrgId,
          sellerOrgName: session.sellerOrg.name,
          roundsCompleted: session.round
        }
      : null;

    const updated = await prisma.negotiationSession.update({
      where: { id: session.id },
      data: {
        buyerConfirmed: nextBuyerConfirmed,
        sellerConfirmed: nextSellerConfirmed,
        agreedUnitPrice: finalUnitPrice,
        agreedTotalValue: finalTotalValue,
        status: bothConfirmed ? 'AGREED' : 'AWAITING_CONFIRMATION',
        ...(snapshot ? { agreedTermsSnapshot: snapshot } : {})
      },
      include: {
        buyerOrg: { select: { id: true, name: true, city: true } },
        sellerOrg: { select: { id: true, name: true, city: true } },
        rounds: { orderBy: { roundNumber: 'asc' } }
      }
    });

    const counterpartyOrgId = isBuyer ? session.sellerOrgId : session.buyerOrgId;
    await notifyOrganization({
      organizationId: counterpartyOrgId,
      category: 'NEGOTIATION',
      title: bothConfirmed ? `Negotiation Agreed: ${session.productName}` : `Counterparty Confirmed Terms: ${session.productName}`,
      body: bothConfirmed
        ? `Both parties confirmed ₹${finalUnitPrice}/${session.unit} (${session.quantity} ${session.unit}). Ready to create order.`
        : `${req.organization.name} confirmed ₹${finalUnitPrice}/${session.unit}. Waiting for your confirmation.`
    });

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: bothConfirmed ? 'KAEN_AGREEMENT_LOCKED' : 'KAEN_PARTY_CONFIRMED',
      targetEntity: 'NegotiationSession',
      targetId: session.id,
      details: { side: isBuyer ? 'BUYER' : 'SELLER', finalUnitPrice, quantity: session.quantity, bothConfirmed }
    });

    res.json({ session: sanitizeSessionForOrg(updated, req.organization.id) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to confirm negotiation terms.' });
  }
});

router.post('/sessions/:id/cancel', requireAuth, requireActiveAccount, requireOrgContext, async (req, res) => {
  const session = await prisma.negotiationSession.findUnique({ where: { id: req.params.id } });
  if (!session || (session.buyerOrgId !== req.organization.id && session.sellerOrgId !== req.organization.id)) {
    return res.status(404).json({ error: 'Negotiation session not found.' });
  }
  if (session.status === 'AGREED') return res.status(400).json({ error: 'Cannot cancel an already agreed negotiation.' });

  const updated = await prisma.negotiationSession.update({ where: { id: session.id }, data: { status: 'CANCELLED' } });
  res.json({ session: sanitizeSessionForOrg(updated, req.organization.id) });
});

export default router;
