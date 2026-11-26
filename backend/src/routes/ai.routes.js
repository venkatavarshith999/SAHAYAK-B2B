import express from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../config/db.js';
import { hasPlatformPermission } from '../config/permissions.js';
import { requireAuth, requireActiveAccount, requirePermission } from '../middleware/auth.js';
import { GeminiB2BProvider } from '../ai/geminiProvider.js';

const router = express.Router();
let geminiInstance = null;

function getGeminiProvider() {
  if (!geminiInstance) {
    geminiInstance = new GeminiB2BProvider();
  }
  return geminiInstance;
}

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.GEMINI_RATE_LIMIT_PER_MIN || 30),
  message: {
    error: 'SAHAYAK AI is receiving too many requests right now. Please wait a minute and try again.',
    code: 'AI_RATE_LIMITED',
    retryable: true
  }
});

/**
 * Builds strictly permission-scoped, organization-isolated context for the AI prompt.
 * Never grants unrestricted DB access and never exposes owner-private financial settings
 * or cross-organization records.
 */
async function buildAuthorizedAiContext(req) {
  const parts = [];
  const role = req.user.role;
  const org = req.organization;

  if (org) {
    parts.push(
      `Organization: ${org.name} (Portal: ${org.portalType}, BusinessType: ${org.businessType}, Location: ${org.city}, ${org.state}, Verification: ${org.verificationStatus})`
    );
  } else if (req.user.businessProfile) {
    parts.push(
      `Business: ${req.user.businessProfile.businessName} (${req.user.businessProfile.city}, ${req.user.businessProfile.state})`
    );
  }

  try {
    if (hasPlatformPermission(role, 'VIEW_ADMIN')) {
      const [pendingKyc, activeOrgs, totalUsers] = await Promise.all([
        prisma.businessVerification.count({
          where: { status: { in: ['PENDING_VERIFICATION', 'NEEDS_INFO', 'ON_HOLD'] } }
        }),
        prisma.organization.count({ where: { verificationStatus: 'ACTIVE' } }),
        prisma.user.count()
      ]);
      parts.push(`Platform Summary: ${totalUsers} users, ${activeOrgs} verified organizations, ${pendingKyc} pending verifications`);
    } else if (role === 'WORKER' && org && req.membership) {
      const assignedTasks = await prisma.workerTask.count({
        where: { organizationId: org.id, assignedToId: req.user.id, status: { in: ['PENDING', 'IN_PROGRESS'] } }
      });
      parts.push(
        `Worker Role: ${req.membership.workerRole || 'STAFF'}, Department: ${req.membership.department || 'General'}, Open Assigned Tasks: ${assignedTasks}`
      );
    } else if (org && org.portalType === 'BUYER') {
      const [openRfqs, savedSuppliers, totalOrders] = await Promise.all([
        prisma.rfq.count({ where: { buyerOrgId: org.id, status: { in: ['OPEN', 'QUOTED', 'NEGOTIATING'] } } }),
        prisma.savedSupplier.count({ where: { buyerOrgId: org.id } }),
        prisma.order.count({ where: { buyerOrgId: org.id } })
      ]);
      parts.push(`Buyer Metrics: ${openRfqs} active RFQs, ${savedSuppliers} saved suppliers, ${totalOrders} orders`);
    } else if (org && org.portalType === 'SELLER') {
      const [activeProducts, sellerOrders, prodOrders] = await Promise.all([
        prisma.product.count({ where: { organizationId: org.id, isActive: true } }),
        prisma.order.count({ where: { sellerOrgId: org.id } }),
        org.businessType === 'MANUFACTURER'
          ? prisma.productionOrder.count({ where: { organizationId: org.id, stage: { in: ['PLANNED', 'RAW_MATERIAL', 'IN_PRODUCTION', 'QUALITY_CHECK'] } } })
          : Promise.resolve(null)
      ]);
      const extra = prodOrders !== null ? `, ${prodOrders} active production batches` : '';
      parts.push(`Seller Metrics: ${activeProducts} active SKUs, ${sellerOrders} orders${extra}`);
    } else if (org && org.portalType === 'LOGISTICS') {
      const [vehicles, activeShipments] = await Promise.all([
        prisma.vehicle.count({ where: { organizationId: org.id } }),
        prisma.shipment.count({ where: { organizationId: org.id, status: { in: ['CREATED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] } } })
      ]);
      parts.push(`Logistics Metrics: ${vehicles} fleet vehicles, ${activeShipments} active shipments`);
    }
  } catch {
    // Non-fatal: omit metric counts if DB query fails while preserving base org/role context
  }

  return parts.join(' | ');
}

router.post('/ai/chat', requireAuth, requireActiveAccount, requirePermission('USE_AI'), aiLimiter, async (req, res) => {
  try {
    const { prompt, history = [], conversationId = null } = req.body || {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({
        error: 'Please enter a message for SAHAYAK AI.',
        code: 'AI_EMPTY_PROMPT',
        retryable: false
      });
    }

    const cleanPrompt = prompt.trim().slice(0, 4000);
    const businessContext = await buildAuthorizedAiContext(req);

    // Ensure or create persistent Conversation belonging strictly to THIS user
    let activeConversationId = conversationId;
    if (activeConversationId) {
      const owned = await prisma.conversation.findFirst({
        where: { id: activeConversationId, userId: req.user.id }
      });
      if (!owned) activeConversationId = null;
    }
    if (!activeConversationId) {
      const created = await prisma.conversation.create({
        data: {
          userId: req.user.id,
          title: cleanPrompt.slice(0, 60),
          roleScope: req.user.role
        }
      });
      activeConversationId = created.id;
    }

    // Call Gemini provider FIRST (with timeout, retries, backoff, and AiUsage logging).
    // Never fabricate a fake answer if the provider fails.
    const result = await getGeminiProvider().generateBusinessResponse({
      userId: req.user.id,
      organizationId: req.organization?.id || null,
      role: req.user.role,
      prompt: cleanPrompt,
      history: Array.isArray(history) ? history : [],
      businessContext
    });

    // Persist both user prompt and assistant response cleanly after provider succeeds
    await prisma.$transaction([
      prisma.message.create({
        data: { conversationId: activeConversationId, sender: 'user', content: cleanPrompt }
      }),
      prisma.message.create({
        data: { conversationId: activeConversationId, sender: 'ai', content: result.text }
      }),
      prisma.conversation.update({
        where: { id: activeConversationId },
        data: { updatedAt: new Date() }
      })
    ]);

    res.json({ ...result, conversationId: activeConversationId });
  } catch (err) {
    const statusCode = err.statusCode || 503;
    const safeMessage =
      err.userMessage || 'SAHAYAK AI is temporarily unavailable. Please try again.';
    res.status(statusCode).json({
      error: safeMessage,
      code: err.errorCode || 'AI_TEMPORARILY_UNAVAILABLE',
      retryable: err.retryable !== false
    });
  }
});

router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 20
    });
    res.json(conversations);
  } catch {
    res.status(500).json({ error: 'Failed to load conversations.' });
  }
});

router.post('/conversations', requireAuth, async (req, res) => {
  try {
    const conversation = await prisma.conversation.create({
      data: {
        userId: req.user.id,
        title: String(req.body?.title || 'New Chat').slice(0, 100),
        roleScope: req.user.role
      }
    });
    res.status(201).json(conversation);
  } catch {
    res.status(500).json({ error: 'Failed to create conversation.' });
  }
});

router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const messages = await prisma.message.findMany({
      where: { conversationId: req.params.id },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch {
    res.status(500).json({ error: 'Failed to load messages.' });
  }
});

export default router;
