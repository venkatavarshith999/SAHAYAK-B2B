/**
 * SAHAYAK B2B — Workers Portal API (Organization-Isolated)
 * Tasks, Attendance (Check-In/Out + Working Hours), Leave Applications & Approvals.
 */

import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { hasOrgPermission } from '../config/permissions.js';
import { requireAuth, requireActiveAccount, requireOrgContext } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { writeAuditLog } from '../services/auditService.js';

const router = express.Router();
router.use(requireAuth, requireActiveAccount, requireOrgContext);

const todayISO = () => new Date().toISOString().slice(0, 10);

const createTaskSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(1000).optional().or(z.literal('')),
  category: z.enum(['GENERAL', 'PROCUREMENT', 'SALES', 'WAREHOUSE', 'MANUFACTURING', 'LOGISTICS', 'VERIFICATION']).default('GENERAL'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  assignedToId: z.string().uuid(),
  dueDate: z.string().optional().nullable()
});

const updateTaskSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']).optional(),
  notes: z.string().max(1000).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional()
});

const checkInSchema = z.object({
  shift: z.enum(['GENERAL', 'MORNING', 'EVENING', 'NIGHT']).optional().default('GENERAL'),
  locationConsent: z.boolean().optional().default(false),
  locationNote: z.string().max(160).optional().nullable()
});

const applyLeaveSchema = z.object({
  leaveType: z.enum(['CASUAL', 'SICK', 'EARNED', 'UNPAID']).default('CASUAL'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(3).max(500)
});

const reviewLeaveSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().max(400).optional().default('')
});

// ── Worker Dashboard Summary ──────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const orgId = req.organization.id;
    const userId = req.user.id;
    const today = todayISO();
    const now = new Date();

    const [tasks, todayAttendance, monthAttendance, leaves, notifications] = await Promise.all([
      prisma.workerTask.findMany({ where: { organizationId: orgId, assignedToId: userId } }),
      prisma.attendanceRecord.findUnique({ where: { organizationId_userId_date: { organizationId: orgId, userId, date: today } } }),
      prisma.attendanceRecord.findMany({
        where: { organizationId: orgId, userId, date: { gte: today.slice(0, 7) + '-01' } }
      }),
      prisma.leaveRequest.findMany({ where: { organizationId: orgId, userId } }),
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 5 })
    ]);

    const pendingTasks = tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
    const overdueTasks = tasks.filter((t) => t.status !== 'COMPLETED' && t.dueDate && t.dueDate < now).length;
    const approvedLeaveDays = leaves.filter((l) => l.status === 'APPROVED').reduce((acc, l) => acc + l.days, 0);
    const totalMinutesMonth = monthAttendance.reduce((acc, a) => acc + (a.workMinutes || 0), 0);

    res.json({
      stats: {
        totalTasks: tasks.length,
        pendingTasks,
        completedTasks,
        overdueTasks,
        daysPresentThisMonth: monthAttendance.length,
        hoursWorkedThisMonth: Math.round((totalMinutesMonth / 60) * 10) / 10,
        leaveAllowance: 18,
        approvedLeaveDays,
        remainingLeaveDays: Math.max(0, 18 - approvedLeaveDays),
        pendingLeaveRequests: leaves.filter((l) => l.status === 'PENDING').length
      },
      todayAttendance,
      notifications
    });
  } catch {
    res.status(500).json({ error: 'Failed to load worker dashboard.' });
  }
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get('/tasks', async (req, res) => {
  try {
    const scope = String(req.query.scope || 'mine');
    const orgId = req.organization.id;
    const canViewAll = hasOrgPermission(req.membership, 'ASSIGN_TASKS') || hasOrgPermission(req.membership, 'MANAGE_WORKERS');

    if (scope === 'org' && !canViewAll) {
      return res.status(403).json({ error: 'Only owners or authorized managers can view all organization tasks.' });
    }

    const where = scope === 'org'
      ? { organizationId: orgId }
      : { organizationId: orgId, assignedToId: req.user.id };

    const tasks = await prisma.workerTask.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true } },
        assignedBy: { select: { id: true, fullName: true, email: true } }
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
    });
    res.json({ tasks });
  } catch {
    res.status(500).json({ error: 'Failed to load tasks.' });
  }
});

router.post('/tasks', validateBody(createTaskSchema), async (req, res) => {
  if (!hasOrgPermission(req.membership, 'ASSIGN_TASKS') && !hasOrgPermission(req.membership, 'MANAGE_WORKERS')) {
    return res.status(403).json({ error: 'Missing permission to assign worker tasks.' });
  }
  try {
    const data = req.validatedBody;
    // Strictly verify assignee belongs to the SAME organization
    const member = await prisma.organizationMembership.findFirst({
      where: { organizationId: req.organization.id, userId: data.assignedToId, employmentStatus: 'ACTIVE' }
    });
    if (!member) {
      return res.status(400).json({ error: 'Assignee must be an active member of your organization.' });
    }

    const task = await prisma.workerTask.create({
      data: {
        organizationId: req.organization.id,
        branchId: member.branchId || null,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        category: data.category,
        priority: data.priority,
        assignedToId: data.assignedToId,
        assignedById: req.user.id,
        dueDate: data.dueDate ? new Date(data.dueDate) : null
      },
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true } },
        assignedBy: { select: { id: true, fullName: true, email: true } }
      }
    });

    await prisma.notification.create({
      data: {
        userId: data.assignedToId,
        category: 'TASK',
        title: `New Task Assigned: ${task.title}`,
        body: `Priority: ${task.priority}. Assigned by ${req.user.fullName}.`
      }
    }).catch(() => {});

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'ASSIGN_WORKER_TASK',
      targetEntity: 'WorkerTask',
      targetId: task.id,
      details: { title: task.title, assignedToId: data.assignedToId, priority: task.priority }
    });

    res.status(201).json({ task });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create task.' });
  }
});

router.patch('/tasks/:id', validateBody(updateTaskSchema), async (req, res) => {
  try {
    const task = await prisma.workerTask.findFirst({
      where: { id: req.params.id, organizationId: req.organization.id }
    });
    if (!task) return res.status(404).json({ error: 'Task not found in your organization.' });

    const isManager = hasOrgPermission(req.membership, 'ASSIGN_TASKS') || hasOrgPermission(req.membership, 'MANAGE_WORKERS');
    if (task.assignedToId !== req.user.id && !isManager) {
      return res.status(403).json({ error: 'You can only update tasks assigned to you.' });
    }

    const data = req.validatedBody;
    const updateData = {};
    if (data.status) {
      updateData.status = data.status;
      updateData.completedAt = data.status === 'COMPLETED' ? new Date() : null;
    }
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.priority && isManager) updateData.priority = data.priority;

    const updated = await prisma.workerTask.update({
      where: { id: task.id },
      data: updateData,
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true } },
        assignedBy: { select: { id: true, fullName: true, email: true } }
      }
    });

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'UPDATE_WORKER_TASK',
      targetEntity: 'WorkerTask',
      targetId: task.id,
      details: { previousStatus: task.status, newStatus: updated.status }
    });

    res.json({ task: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update task.' });
  }
});

// ── Attendance (Check-In / Check-Out + Working Hours) ─────────────────────────
router.get('/attendance', async (req, res) => {
  const records = await prisma.attendanceRecord.findMany({
    where: { organizationId: req.organization.id, userId: req.user.id },
    orderBy: { date: 'desc' },
    take: 30
  });
  const today = records.find((r) => r.date === todayISO()) || null;
  res.json({ today, records });
});

router.post('/attendance/check-in', validateBody(checkInSchema), async (req, res) => {
  try {
    const date = todayISO();
    const existing = await prisma.attendanceRecord.findUnique({
      where: { organizationId_userId_date: { organizationId: req.organization.id, userId: req.user.id, date } }
    });
    if (existing) return res.status(400).json({ error: 'You have already checked in today.' });

    const { shift, locationConsent, locationNote } = req.validatedBody;
    const record = await prisma.attendanceRecord.create({
      data: {
        organizationId: req.organization.id,
        userId: req.user.id,
        date,
        checkInAt: new Date(),
        shift,
        locationConsent: Boolean(locationConsent),
        locationNote: locationConsent ? (locationNote?.trim() || null) : null,
        status: 'PRESENT'
      }
    });
    res.status(201).json({ record });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Check-in failed.' });
  }
});

router.post('/attendance/check-out', async (req, res) => {
  try {
    const date = todayISO();
    const existing = await prisma.attendanceRecord.findUnique({
      where: { organizationId_userId_date: { organizationId: req.organization.id, userId: req.user.id, date } }
    });
    if (!existing) return res.status(400).json({ error: 'You must check in before checking out.' });
    if (existing.checkOutAt) return res.status(400).json({ error: 'You have already checked out today.' });

    const checkOutAt = new Date();
    const workMinutes = Math.max(1, Math.round((checkOutAt.getTime() - existing.checkInAt.getTime()) / 60000));
    const record = await prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        checkOutAt,
        workMinutes,
        status: workMinutes < 240 ? 'HALF_DAY' : 'PRESENT'
      }
    });
    res.json({ record });
  } catch {
    res.status(500).json({ error: 'Check-out failed.' });
  }
});

router.get('/attendance/team', async (req, res) => {
  if (!hasOrgPermission(req.membership, 'APPROVE_LEAVE') && !hasOrgPermission(req.membership, 'MANAGE_WORKERS')) {
    return res.status(403).json({ error: 'Manager or owner permission required to view team attendance.' });
  }
  const records = await prisma.attendanceRecord.findMany({
    where: { organizationId: req.organization.id },
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: [{ date: 'desc' }, { checkInAt: 'desc' }],
    take: 50
  });
  res.json({ records });
});

// ── Leave Applications & Approvals ────────────────────────────────────────────
router.get('/leaves', async (req, res) => {
  const scope = String(req.query.scope || 'mine');
  const canApprove = hasOrgPermission(req.membership, 'APPROVE_LEAVE') || hasOrgPermission(req.membership, 'MANAGE_WORKERS');
  if (scope === 'org' && !canApprove) {
    return res.status(403).json({ error: 'Manager or owner permission required to view team leave requests.' });
  }
  const where = scope === 'org'
    ? { organizationId: req.organization.id }
    : { organizationId: req.organization.id, userId: req.user.id };

  const leaves = await prisma.leaveRequest.findMany({
    where,
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      reviewedBy: { select: { id: true, fullName: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ leaves });
});

router.post('/leaves', validateBody(applyLeaveSchema), async (req, res) => {
  try {
    const { leaveType, startDate, endDate, reason } = req.validatedBody;
    const d1 = new Date(startDate);
    const d2 = new Date(endDate);
    if (d2 < d1) return res.status(400).json({ error: 'End date cannot be earlier than start date.' });
    const days = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);

    const leave = await prisma.leaveRequest.create({
      data: {
        organizationId: req.organization.id,
        userId: req.user.id,
        leaveType,
        startDate,
        endDate,
        days,
        reason: reason.trim(),
        status: 'PENDING'
      }
    });
    res.status(201).json({ leave });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Leave application failed.' });
  }
});

router.patch('/leaves/:id/review', validateBody(reviewLeaveSchema), async (req, res) => {
  if (!hasOrgPermission(req.membership, 'APPROVE_LEAVE') && !hasOrgPermission(req.membership, 'MANAGE_WORKERS')) {
    return res.status(403).json({ error: 'You do not have permission to approve or reject leave requests.' });
  }
  try {
    const leave = await prisma.leaveRequest.findFirst({
      where: { id: req.params.id, organizationId: req.organization.id }
    });
    if (!leave) return res.status(404).json({ error: 'Leave request not found in your organization.' });
    if (leave.userId === req.user.id && !req.membership.isOwner) {
      return res.status(403).json({ error: 'You cannot approve your own leave application.' });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id: leave.id },
      data: {
        status: req.validatedBody.status,
        reviewedById: req.user.id,
        reviewerNotes: req.validatedBody.notes || null,
        reviewedAt: new Date()
      }
    });

    await prisma.notification.create({
      data: {
        userId: leave.userId,
        category: 'LEAVE',
        title: `Leave Request ${updated.status}`,
        body: `${leave.startDate} to ${leave.endDate} (${leave.days} day(s)) was ${updated.status.toLowerCase()}.`
      }
    }).catch(() => {});

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: `LEAVE_${updated.status}`,
      targetEntity: 'LeaveRequest',
      targetId: leave.id,
      details: { applicantId: leave.userId, days: leave.days, notes: req.validatedBody.notes }
    });

    res.json({ leave: updated });
  } catch {
    res.status(500).json({ error: 'Failed to review leave request.' });
  }
});

export default router;
