import crypto from 'crypto';
import { prisma } from '../config/db.js';

/**
 * Writes an immutable SHA-256 hash-chained audit entry.
 * Used for both platform admin actions and organization-level manager decisions.
 */
export async function writeAuditLog({
  actorId,
  organizationId = null,
  action,
  targetEntity,
  targetId,
  details = {}
}) {
  try {
    const last = await prisma.adminAuditLog.findFirst({ orderBy: { createdAt: 'desc' } });
    const prevHash = last?.entryHash || '0'.repeat(64);

    const payload = JSON.stringify({
      actorId,
      organizationId,
      action,
      targetEntity,
      targetId,
      details,
      ts: Date.now(),
      nonce: crypto.randomBytes(6).toString('hex')
    });
    const entryHash = crypto.createHash('sha256').update(prevHash + payload).digest('hex');

    return await prisma.adminAuditLog.create({
      data: {
        actorId,
        organizationId,
        action,
        targetEntity,
        targetId,
        details,
        prevHash,
        entryHash
      }
    });
  } catch (err) {
    console.error('[Audit Log Error]', err.message);
    return null;
  }
}
