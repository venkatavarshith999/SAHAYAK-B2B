import express from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../config/db.js';
import { requireAuth, requireActiveAccount, requirePermission } from '../middleware/auth.js';
import { GeminiB2BProvider } from '../ai/geminiProvider.js';

const router = express.Router();
const gemini = new GeminiB2BProvider();

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.GEMINI_RATE_LIMIT_PER_MIN || 30),
  message: { error: 'AI rate limit reached. Please wait a minute and try again.' }
});

router.post('/ai/chat', requireAuth, requireActiveAccount, requirePermission('USE_AI'), aiLimiter, async (req, res) => {
  try {
    const { prompt, history = [], conversationId = null } = req.body || {};
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const cleanPrompt = String(prompt).trim().slice(0, 4000);

    // Build strictly authorized context (never leaks cross-org or owner-private financial secrets to workers)
    const contextParts = [];
    if (req.organization) {
      contextParts.push(
        `Organization: ${req.organization.name} (${req.organization.businessType}, ${req.organization.city}, ${req.organization.state}, Verification: ${req.organization.verificationStatus})`
      );
    } else if (req.user.businessProfile) {
      contextParts.push(
        `Business: ${req.user.businessProfile.businessName} (${req.user.businessProfile.city}, ${req.user.businessProfile.state})`
      );
    }
    if (req.user.role === 'WORKER' && req.membership) {
      contextParts.push(
        `Worker Role: ${req.membership.workerRole || 'STAFF'}, Department: ${req.membership.department || 'General'}`
      );
    }

    // Ensure or create persistent Conversation belonging to THIS user
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

    // Persist user message
    await prisma.message.create({
      data: { conversationId: activeConversationId, sender: 'user', content: cleanPrompt }
    });

    // Call Gemini provider (which logs AiUsage ONCE with real token counts & latency)
    const result = await gemini.generateBusinessResponse({
      userId: req.user.id,
      organizationId: req.organization?.id || null,
      role: req.user.role,
      prompt: cleanPrompt,
      history: Array.isArray(history) ? history : [],
      businessContext: contextParts.join(' | ')
    });

    // Persist assistant response
    await prisma.message.create({
      data: { conversationId: activeConversationId, sender: 'ai', content: result.text }
    });

    res.json({ ...result, conversationId: activeConversationId });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'AI Assistant unavailable.' });
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
