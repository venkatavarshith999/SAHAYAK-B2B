/**
 * SAHAYAK B2B — Phase D Module 4: Shared B2B Business Chat
 * Organization-isolated one-to-one business conversations with text, PDF/image attachments,
 * Product/RFQ/Quotation/Order entity references, search, unread tracking, and notifications.
 */

import express from 'express';
import fs from 'fs';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { documentUpload, resolveSafeUploadPath } from '../config/upload.js';
import { requireAuth, requireActiveAccount, requireOrgContext } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { notifyOrganization } from '../services/notifyService.js';

const router = express.Router();
router.use(requireAuth, requireActiveAccount, requireOrgContext);

function canonicalPair(id1, id2) {
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

// ── List My Organization's B2B Conversations ──────────────────────────────────
router.get('/conversations', async (req, res) => {
  try {
    const orgId = req.organization.id;
    const convs = await prisma.businessConversation.findMany({
      where: { OR: [{ orgAId: orgId }, { orgBId: orgId }] },
      include: {
        orgA: { select: { id: true, name: true, businessType: true, city: true, gstVerified: true } },
        orgB: { select: { id: true, name: true, businessType: true, city: true, gstVerified: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 20 }
      },
      orderBy: { lastMessageAt: 'desc' }
    });

    const formatted = convs.map((c) => {
      const counterparty = c.orgAId === orgId ? c.orgB : c.orgA;
      const latest = c.messages[0] || null;
      const unreadCount = c.messages.filter((m) => {
        if (m.senderOrgId === orgId) return false;
        const readBy = Array.isArray(m.readByOrgIds) ? m.readByOrgIds : [];
        return !readBy.includes(orgId);
      }).length;
      return {
        id: c.id,
        subject: c.subject,
        counterparty,
        lastMessageAt: c.lastMessageAt,
        latestMessage: latest ? { body: latest.body, senderName: latest.senderName, createdAt: latest.createdAt } : null,
        unreadCount
      };
    });

    res.json({ conversations: formatted });
  } catch {
    res.status(500).json({ error: 'Failed to load business conversations.' });
  }
});

// ── Start or Retrieve Conversation with Another Verified Organization ─────────
router.post('/conversations', validateBody(z.object({ targetOrgId: z.string().uuid(), subject: z.string().max(160).optional() })), async (req, res) => {
  try {
    const { targetOrgId, subject } = req.validatedBody;
    if (targetOrgId === req.organization.id) {
      return res.status(400).json({ error: 'Cannot start a B2B chat with your own organization.' });
    }
    const target = await prisma.organization.findFirst({ where: { id: targetOrgId, verificationStatus: 'ACTIVE' } });
    if (!target) return res.status(404).json({ error: 'Target verified organization not found.' });

    const [orgAId, orgBId] = canonicalPair(req.organization.id, targetOrgId);
    const conv = await prisma.businessConversation.upsert({
      where: { orgAId_orgBId: { orgAId, orgBId } },
      update: {},
      create: { orgAId, orgBId, subject: subject?.trim() || null },
      include: {
        orgA: { select: { id: true, name: true, businessType: true, city: true } },
        orgB: { select: { id: true, name: true, businessType: true, city: true } }
      }
    });

    const counterparty = conv.orgAId === req.organization.id ? conv.orgB : conv.orgA;
    res.status(201).json({ conversation: { id: conv.id, subject: conv.subject, counterparty, lastMessageAt: conv.lastMessageAt } });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to open conversation.' });
  }
});

// ── Get Messages (Org-Isolated + Marks Unread Messages as Read) ───────────────
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const orgId = req.organization.id;
    const conv = await prisma.businessConversation.findUnique({ where: { id: req.params.id } });
    if (!conv || (conv.orgAId !== orgId && conv.orgBId !== orgId)) {
      return res.status(403).json({ error: 'Access denied to this business conversation.' });
    }

    const search = req.query.search ? String(req.query.search).trim() : '';
    const where = { conversationId: conv.id };
    if (search) where.body = { contains: search, mode: 'insensitive' };

    const messages = await prisma.businessMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 150
    });

    // Mark unread counterparty messages as read by this org
    const toMark = messages.filter((m) => {
      if (m.senderOrgId === orgId) return false;
      const readBy = Array.isArray(m.readByOrgIds) ? m.readByOrgIds : [];
      return !readBy.includes(orgId);
    });
    if (toMark.length) {
      await Promise.all(
        toMark.map((m) =>
          prisma.businessMessage.update({
            where: { id: m.id },
            data: { readByOrgIds: [...(Array.isArray(m.readByOrgIds) ? m.readByOrgIds : []), orgId] }
          })
        )
      );
    }

    res.json({ messages });
  } catch {
    res.status(500).json({ error: 'Failed to load messages.' });
  }
});

// ── Send Message (JSON or Multipart with Optional Attachment & Entity Ref) ────
router.post('/conversations/:id/messages', (req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    return documentUpload.single('file')(req, res, (err) => {
      if (err) return res.status(err.statusCode || 400).json({ error: err.message });
      next();
    });
  }
  next();
}, async (req, res) => {
  try {
    const orgId = req.organization.id;
    const conv = await prisma.businessConversation.findUnique({ where: { id: req.params.id } });
    if (!conv || (conv.orgAId !== orgId && conv.orgBId !== orgId)) {
      return res.status(403).json({ error: 'Access denied to this business conversation.' });
    }

    const body = String(req.body?.body || '').trim();
    if (!body && !req.file) {
      return res.status(400).json({ error: 'Message text or file attachment is required.' });
    }

    const validRefTypes = ['PRODUCT', 'RFQ', 'QUOTATION', 'NEGOTIATION', 'ORDER'];
    const refType = validRefTypes.includes(req.body?.refType) ? req.body.refType : null;

    const msg = await prisma.$transaction(async (tx) => {
      const m = await tx.businessMessage.create({
        data: {
          conversationId: conv.id,
          senderOrgId: orgId,
          senderUserId: req.user.id,
          senderName: req.user.fullName,
          body: (body || (req.file ? `Sent attachment: ${req.file.originalname}` : '')).slice(0, 3000),
          attachmentStorageKey: req.file?.filename || null,
          attachmentFileName: req.file?.originalname?.slice(0, 180) || null,
          attachmentMimeType: req.file?.mimetype || null,
          refType,
          refId: refType && req.body?.refId ? String(req.body.refId).slice(0, 80) : null,
          refLabel: refType && req.body?.refLabel ? String(req.body.refLabel).slice(0, 160) : null,
          readByOrgIds: [orgId]
        }
      });
      await tx.businessConversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } });
      return m;
    });

    const counterpartyOrgId = conv.orgAId === orgId ? conv.orgBId : conv.orgAId;
    await notifyOrganization({
      organizationId: counterpartyOrgId,
      category: 'CHAT',
      title: `New Message from ${req.organization.name}`,
      body: `${req.user.fullName}: ${msg.body.slice(0, 140)}`,
      includeWorkerRoles: ['BUSINESS_MANAGER', 'SALES_EXECUTIVE', 'PROCUREMENT_MANAGER', 'CUSTOMER_SUPPORT']
    });

    res.status(201).json({ message: msg });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to send message.' });
  }
});

// ── Org-Isolated Attachment Download ──────────────────────────────────────────
router.get('/messages/:id/attachment', async (req, res) => {
  try {
    const msg = await prisma.businessMessage.findUnique({
      where: { id: req.params.id },
      include: { conversation: true }
    });
    if (!msg || !msg.attachmentStorageKey) return res.status(404).json({ error: 'Attachment not found.' });

    const orgId = req.organization.id;
    if (msg.conversation.orgAId !== orgId && msg.conversation.orgBId !== orgId) {
      return res.status(403).json({ error: 'Access denied to this chat attachment.' });
    }

    const filePath = resolveSafeUploadPath(msg.attachmentStorageKey);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Attachment file missing.' });

    res.setHeader('Content-Type', msg.attachmentMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${(msg.attachmentFileName || 'file').replace(/"/g, '')}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.status(500).json({ error: 'Failed to retrieve attachment.' });
  }
});

export default router;
