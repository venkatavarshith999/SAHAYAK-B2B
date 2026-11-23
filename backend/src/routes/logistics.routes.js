/**
 * SAHAYAK B2B — Transport & Logistics Portal API
 * Fleet/Vehicles, Driver Assignment, Shipments & Structured Lifecycle Tracking with POD.
 * Strictly isolated to organizations with portalType === 'LOGISTICS'.
 */

import express from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth, requireActiveAccount, requireOrgContext } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { writeAuditLog } from '../services/auditService.js';

const router = express.Router();

const SHIPMENT_STATUSES = [
  'CREATED',
  'AWAITING_ACCEPTANCE',
  'ACCEPTED',
  'PICKUP_SCHEDULED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'RETURNED',
  'CANCELLED'
];

router.use(requireAuth, requireActiveAccount, requireOrgContext, (req, res, next) => {
  if (req.organization.portalType !== 'LOGISTICS') {
    return res.status(403).json({ error: 'Logistics portal access requires a Transport & Logistics organization.' });
  }
  next();
});

const createVehicleSchema = z.object({
  registrationNo: z.string().min(4).max(30),
  vehicleType: z.string().min(2).max(60),
  capacityKg: z.coerce.number().int().min(50),
  insuranceExpiry: z.string().optional().nullable(),
  permitExpiry: z.string().optional().nullable(),
  assignedDriverId: z.string().uuid().optional().nullable()
});

const updateVehicleSchema = z.object({
  status: z.enum(['AVAILABLE', 'ON_TRIP', 'MAINTENANCE']).optional(),
  assignedDriverId: z.string().uuid().optional().nullable(),
  capacityKg: z.coerce.number().int().min(50).optional()
});

const createShipmentSchema = z.object({
  clientName: z.string().min(2).max(160),
  originCity: z.string().min(2).max(80),
  destinationCity: z.string().min(2).max(80),
  weightKg: z.coerce.number().positive(),
  quotedAmount: z.coerce.number().positive().optional().nullable(),
  vehicleId: z.string().uuid().optional().nullable(),
  driverUserId: z.string().uuid().optional().nullable(),
  pickupDate: z.string().optional().nullable()
});

const updateShipmentSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES).optional(),
  vehicleId: z.string().uuid().optional().nullable(),
  driverUserId: z.string().uuid().optional().nullable(),
  quotedAmount: z.coerce.number().positive().optional().nullable(),
  podNotes: z.string().max(1000).optional().nullable()
});

// ── Logistics Overview ────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const orgId = req.organization.id;
    const [shipments, vehicles, driversCount, teamCount, branchesCount] = await Promise.all([
      prisma.shipment.findMany({ where: { organizationId: orgId } }),
      prisma.vehicle.findMany({ where: { organizationId: orgId } }),
      prisma.organizationMembership.count({ where: { organizationId: orgId, workerRole: 'DRIVER', employmentStatus: 'ACTIVE' } }),
      prisma.organizationMembership.count({ where: { organizationId: orgId, employmentStatus: 'ACTIVE' } }),
      prisma.branch.count({ where: { organizationId: orgId } })
    ]);

    const delivered = shipments.filter((s) => s.status === 'DELIVERED').length;
    const failed = shipments.filter((s) => s.status === 'FAILED').length;
    const completedTotal = delivered + failed;

    res.json({
      organizationName: req.organization.name,
      stats: {
        totalShipments: shipments.length,
        pendingRequests: shipments.filter((s) => s.status === 'CREATED' || s.status === 'AWAITING_ACCEPTANCE').length,
        inTransit: shipments.filter((s) => ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(s.status)).length,
        delivered,
        failed,
        deliverySuccessRate: completedTotal > 0 ? Math.round((delivered / completedTotal) * 100) : null,
        totalVehicles: vehicles.length,
        availableVehicles: vehicles.filter((v) => v.status === 'AVAILABLE').length,
        activeDrivers: driversCount,
        teamMembers: teamCount,
        branches: branchesCount
      }
    });
  } catch {
    res.status(500).json({ error: 'Failed to load logistics overview.' });
  }
});

// ── Fleet & Vehicles ──────────────────────────────────────────────────────────
router.get('/vehicles', async (req, res) => {
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId: req.organization.id },
    include: { assignedDriver: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ vehicles });
});

router.post('/vehicles', validateBody(createVehicleSchema), async (req, res) => {
  if (!req.membership.isOwner && !['BUSINESS_MANAGER', 'LOGISTICS_COORDINATOR'].includes(req.membership.workerRole)) {
    return res.status(403).json({ error: 'Only owners or logistics coordinators can add vehicles.' });
  }
  try {
    const d = req.validatedBody;
    if (d.assignedDriverId) {
      const driver = await prisma.organizationMembership.findFirst({
        where: { organizationId: req.organization.id, userId: d.assignedDriverId, employmentStatus: 'ACTIVE' }
      });
      if (!driver) return res.status(400).json({ error: 'Assigned driver must belong to your organization.' });
    }
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: req.organization.id,
        registrationNo: d.registrationNo.trim().toUpperCase(),
        vehicleType: d.vehicleType.trim(),
        capacityKg: d.capacityKg,
        insuranceExpiry: d.insuranceExpiry ? new Date(d.insuranceExpiry) : null,
        permitExpiry: d.permitExpiry ? new Date(d.permitExpiry) : null,
        assignedDriverId: d.assignedDriverId || null
      }
    });
    res.status(201).json({ vehicle });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Vehicle registration number already exists in your fleet.' });
    res.status(400).json({ error: err.message || 'Failed to add vehicle.' });
  }
});

router.patch('/vehicles/:id', validateBody(updateVehicleSchema), async (req, res) => {
  if (!req.membership.isOwner && !['BUSINESS_MANAGER', 'LOGISTICS_COORDINATOR'].includes(req.membership.workerRole)) {
    return res.status(403).json({ error: 'Only owners or logistics coordinators can modify vehicles.' });
  }
  const existing = await prisma.vehicle.findFirst({ where: { id: req.params.id, organizationId: req.organization.id } });
  if (!existing) return res.status(404).json({ error: 'Vehicle not found in your organization.' });

  const vehicle = await prisma.vehicle.update({ where: { id: existing.id }, data: req.validatedBody });
  res.json({ vehicle });
});

// ── Shipments & Lifecycle Tracking ────────────────────────────────────────────
router.get('/shipments', async (req, res) => {
  const isDriverOnly = !req.membership.isOwner && req.membership.workerRole === 'DRIVER';
  const where = { organizationId: req.organization.id };
  if (isDriverOnly) where.driverUserId = req.user.id;
  if (req.query.status) where.status = String(req.query.status);

  const shipments = await prisma.shipment.findMany({
    where,
    include: {
      vehicle: { select: { id: true, registrationNo: true, vehicleType: true } },
      driver: { select: { id: true, fullName: true, email: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ shipments });
});

router.post('/shipments', validateBody(createShipmentSchema), async (req, res) => {
  if (!req.membership.isOwner && !['BUSINESS_MANAGER', 'LOGISTICS_COORDINATOR'].includes(req.membership.workerRole)) {
    return res.status(403).json({ error: 'Only owners or logistics coordinators can create shipments.' });
  }
  try {
    const d = req.validatedBody;
    if (d.vehicleId) {
      const v = await prisma.vehicle.findFirst({ where: { id: d.vehicleId, organizationId: req.organization.id } });
      if (!v) return res.status(400).json({ error: 'Selected vehicle does not belong to your organization.' });
    }
    if (d.driverUserId) {
      const drv = await prisma.organizationMembership.findFirst({
        where: { organizationId: req.organization.id, userId: d.driverUserId, employmentStatus: 'ACTIVE' }
      });
      if (!drv) return res.status(400).json({ error: 'Selected driver does not belong to your organization.' });
    }

    const trackingCode = 'SHP-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const shipment = await prisma.shipment.create({
      data: {
        organizationId: req.organization.id,
        trackingCode,
        clientName: d.clientName.trim(),
        originCity: d.originCity.trim(),
        destinationCity: d.destinationCity.trim(),
        weightKg: d.weightKg,
        quotedAmount: d.quotedAmount || null,
        vehicleId: d.vehicleId || null,
        driverUserId: d.driverUserId || null,
        pickupDate: d.pickupDate ? new Date(d.pickupDate) : null,
        status: d.driverUserId ? 'ACCEPTED' : 'CREATED',
        events: [
          {
            status: d.driverUserId ? 'ACCEPTED' : 'CREATED',
            by: req.user.email,
            at: new Date().toISOString(),
            note: 'Shipment created'
          }
        ]
      }
    });

    await writeAuditLog({
      actorId: req.user.id,
      organizationId: req.organization.id,
      action: 'CREATE_SHIPMENT',
      targetEntity: 'Shipment',
      targetId: shipment.id,
      details: { trackingCode, origin: shipment.originCity, destination: shipment.destinationCity }
    });
    res.status(201).json({ shipment });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create shipment.' });
  }
});

router.patch('/shipments/:id', validateBody(updateShipmentSchema), async (req, res) => {
  const existing = await prisma.shipment.findFirst({ where: { id: req.params.id, organizationId: req.organization.id } });
  if (!existing) return res.status(404).json({ error: 'Shipment not found in your organization.' });

  const isManager = req.membership.isOwner || ['BUSINESS_MANAGER', 'LOGISTICS_COORDINATOR'].includes(req.membership.workerRole);
  const isAssignedDriver = existing.driverUserId === req.user.id;
  if (!isManager && !isAssignedDriver) {
    return res.status(403).json({ error: 'You are not authorized to update this shipment.' });
  }

  const d = req.validatedBody;
  const prevEvents = Array.isArray(existing.events) ? existing.events : [];
  const nextEvents = d.status && d.status !== existing.status
    ? [...prevEvents, { status: d.status, by: req.user.email, at: new Date().toISOString(), note: d.podNotes || '' }]
    : prevEvents;

  const updateData = {
    ...(d.status ? { status: d.status } : {}),
    ...(d.podNotes !== undefined ? { podNotes: d.podNotes } : {}),
    ...(d.status === 'DELIVERED' ? { deliveryDate: new Date() } : {}),
    events: nextEvents
  };
  if (isManager) {
    if (d.vehicleId !== undefined) updateData.vehicleId = d.vehicleId;
    if (d.driverUserId !== undefined) updateData.driverUserId = d.driverUserId;
    if (d.quotedAmount !== undefined) updateData.quotedAmount = d.quotedAmount;
  }

  const shipment = await prisma.shipment.update({ where: { id: existing.id }, data: updateData });

  // Sync linked Order status & notify Buyer + Seller when Logistics ships or delivers!
  if (existing.orderId && d.status && ['IN_TRANSIT', 'DELIVERED'].includes(d.status)) {
    const linkedOrder = await prisma.order.findUnique({ where: { id: existing.orderId } });
    if (linkedOrder && linkedOrder.status !== 'CANCELLED') {
      const mappedOrderStatus = d.status === 'DELIVERED' ? 'DELIVERED' : 'SHIPPED';
      const tl = Array.isArray(linkedOrder.timeline) ? linkedOrder.timeline : [];
      await prisma.order.update({
        where: { id: linkedOrder.id },
        data: {
          status: mappedOrderStatus,
          timeline: [...tl, { status: mappedOrderStatus, by: req.user.email, at: new Date().toISOString(), note: `Logistics ${existing.trackingCode}: ${d.status}${d.podNotes ? ' — ' + d.podNotes : ''}` }]
        }
      });
    }
  }

  res.json({ shipment });
});

export default router;
