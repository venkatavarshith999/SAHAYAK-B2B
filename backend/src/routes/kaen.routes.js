import express from 'express';
import { z } from 'zod';
import { requireAuth, requireActiveAccount } from '../middleware/auth.js';
import { hasPlatformPermission, hasOrgPermission } from '../config/permissions.js';
import { validateBody } from '../middleware/validate.js';
import { evaluateNegotiationRound } from '../kaen/negotiationEngine.js';

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

router.post('/negotiate', requireAuth, requireActiveAccount, validateBody(kaenRoundSchema), (req, res) => {
  const allowed =
    hasPlatformPermission(req.user.role, 'USE_KAEN') ||
    hasOrgPermission(req.membership, 'USE_KAEN');

  if (!allowed) {
    return res.status(403).json({ error: 'Your role does not have permission to use KAEN negotiation.' });
  }

  try {
    const outcome = evaluateNegotiationRound(req.validatedBody);
    res.json(outcome);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
