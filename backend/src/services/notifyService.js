import { prisma } from '../config/db.js';

/**
 * Notifies all active owners and (optionally) managers/matching-role workers of an organization.
 */
export async function notifyOrganization({
  organizationId,
  category = 'BUSINESS',
  title,
  body,
  link = null,
  excludeUserId = null,
  includeWorkerRoles = ['BUSINESS_MANAGER']
}) {
  try {
    const members = await prisma.organizationMembership.findMany({
      where: {
        organizationId,
        employmentStatus: 'ACTIVE',
        OR: [
          { isOwner: true },
          ...(includeWorkerRoles.length ? [{ workerRole: { in: includeWorkerRoles } }] : [])
        ]
      },
      select: { userId: true }
    });

    const userIds = [...new Set(members.map((m) => m.userId))].filter((id) => id !== excludeUserId);
    if (!userIds.length) return;

    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        category,
        title: String(title).slice(0, 140),
        body: String(body).slice(0, 500),
        link
      }))
    });
  } catch (err) {
    console.error('[NotifyOrg Error]', err.message);
  }
}
