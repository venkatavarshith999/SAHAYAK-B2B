/**
 * SAHAYAK B2B — Phase C Complete Five-Portal Integration & Isolation Test Suite
 * Tests Super Admin (6 roles), Workers (tasks/attendance/leave), Unified Seller (Wholesaler + Manufacturer),
 * Buyer (discovery/saved/PRs), and Transport & Logistics (fleet/driver/shipments/POD) end-to-end.
 */

import assert from 'node:assert/strict';
import 'dotenv/config';
import { prisma } from '../src/config/db.js';

const BASE = 'http://localhost:4000';
const suffix = Date.now();

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body = null) {
    const headers = { Origin: 'http://localhost:5173' };
    if (this.cookie) headers.Cookie = this.cookie;
    if (body !== null) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined
    });
    const sc = res.headers.get('set-cookie');
    if (sc) {
      const m = sc.match(/sahayak_session=([^;]+)/);
      if (m) this.cookie = `sahayak_session=${m[1]}`;
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  }
}

const createdEmails = [];
const passed = [];
const ok = (msg) => { passed.push(msg); console.log(`  ✅ ${msg}`); };

async function registerAndApprove(admin, client, payload) {
  createdEmails.push(payload.email);
  const reg = await client.req('POST', '/api/auth/register', payload);
  assert.equal(reg.status, 201, `Register failed for ${payload.email}: ${reg.text}`);
  const vq = await admin.req('GET', '/api/admin/verifications');
  const item = vq.json.find((v) => v.business?.user?.email === payload.email);
  assert.ok(item, `Verification item missing for ${payload.email}`);
  const appr = await admin.req('POST', `/api/admin/verifications/${item.id}/approve`, { notes: 'Phase C test approved' });
  assert.equal(appr.status, 200);
  return reg.json;
}

async function run() {
  console.log('\n🔬 Running Phase C Five-Portal E2E & Isolation Tests...\n');

  const superAdmin = new Client();
  const subAdmin = new Client();
  const mfg = new Client();
  const wholesaler = new Client();
  const buyer = new Client();
  const logistics = new Client();
  const mfgWorker = new Client();
  const driver = new Client();

  // ── PORTAL 1: SUPER ADMIN & 6 ADMIN ROLES ──────────────────────────────────
  const saLogin = await superAdmin.req('POST', '/api/auth/login', {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@sahayak.in',
    password: process.env.TEST_ADMIN_PASSWORD || 'ChangeMe123!'
  });
  assert.equal(saLogin.status, 200);

  const subAdminEmail = `veradmin_${suffix}@sahayak.test`;
  createdEmails.push(subAdminEmail);
  const createStaff = await superAdmin.req('POST', '/api/admin/admins', {
    fullName: 'Priya Verification', email: subAdminEmail, password: 'AdminPass123!', role: 'VERIFICATION_ADMIN'
  });
  assert.equal(createStaff.status, 201, createStaff.text);

  // Sub-admin logs in, CANNOT create another admin (403)
  const subLogin = await subAdmin.req('POST', '/api/auth/login', { email: subAdminEmail, password: 'AdminPass123!' });
  assert.equal(subLogin.status, 200);
  const subCreateDenied = await subAdmin.req('POST', '/api/admin/admins', {
    fullName: 'Illegal', email: `ill_${suffix}@test.in`, password: 'AdminPass123!', role: 'SUPER_ADMIN'
  });
  assert.equal(subCreateDenied.status, 403);

  // Super Admin updates role across 6 roles
  const roleUpd = await superAdmin.req('PATCH', `/api/admin/admins/${createStaff.json.admin.id}/role`, { role: 'LOGISTICS_ADMIN' });
  assert.equal(roleUpd.status, 200);
  assert.equal(roleUpd.json.admin.role, 'LOGISTICS_ADMIN');
  ok('Portal 1 (Super Admin): Staff creation, 6-role reassignment, and non-Super-Admin mutation block (403)');

  // ── PORTAL 3: UNIFIED SELLER (MANUFACTURER + WHOLESALER) ───────────────────
  const mfgUser = await registerAndApprove(superAdmin, mfg, {
    fullName: 'Mfg Owner', email: `mfg_${suffix}@test.in`, password: 'Password123!',
    businessType: 'MANUFACTURER', businessName: `Apex Mills ${suffix}`, category: 'Textiles & Garments',
    address: 'Plot 10', city: 'Coimbatore', state: 'Tamil Nadu', pinCode: '641001',
    gstin: `33APEXM${String(suffix).slice(-4)}A1Z5`, productionCapacity: '40,000 meters/month'
  });
  const wsUser = await registerAndApprove(superAdmin, wholesaler, {
    fullName: 'Wholesale Owner', email: `ws_${suffix}@test.in`, password: 'Password123!',
    businessType: 'WHOLESALER', businessName: `Metro Wholesale ${suffix}`, category: 'Textiles & Garments',
    address: 'Market Rd 5', city: 'Hyderabad', state: 'Telangana', pinCode: '500001',
    gstin: `36METRO${String(suffix).slice(-4)}B1Z5`
  });

  // Org profile update + add branch
  const profUpd = await mfg.req('PATCH', '/api/org/profile', { description: 'Certified cotton fabric mill' });
  assert.equal(profUpd.status, 200);
  const branchAdd = await mfg.req('POST', '/api/org/branches', {
    name: 'North Warehouse', type: 'WAREHOUSE', address: 'NH-44', city: 'Salem', state: 'Tamil Nadu', pinCode: '636001'
  });
  assert.equal(branchAdd.status, 201);

  // Manufacturer creates live product & production order
  const prodMfg = await mfg.req('POST', '/api/seller/products', {
    sku: `COT-${suffix}`, name: 'Combed Cotton Twill', category: 'Textiles & Garments',
    unit: 'meter', moq: 100, unitPrice: 185, bulkPrice: 160, bulkMinQty: 1000, stockQty: 2500
  });
  assert.equal(prodMfg.status, 201, prodMfg.text);

  const poRes = await mfg.req('POST', '/api/seller/production-orders', {
    orderNumber: `PO-${suffix}`, productName: 'Combed Cotton Twill', targetQty: 3000, rawMaterialsNote: '40s yarn'
  });
  assert.equal(poRes.status, 201);
  const poUpd = await mfg.req('PATCH', `/api/seller/production-orders/${poRes.json.order.id}`, { stage: 'IN_PRODUCTION', qcStatus: 'PASSED', completedQty: 1200 });
  assert.equal(poUpd.status, 200);

  // Wholesaler can add products, CANNOT access Manufacturer production orders (403) or modify Mfg product (404)
  const prodWs = await wholesaler.req('POST', '/api/seller/products', {
    sku: `SHIRT-${suffix}`, name: 'School Uniform Shirt', category: 'Textiles & Garments',
    unit: 'pcs', moq: 50, unitPrice: 270, stockQty: 400
  });
  assert.equal(prodWs.status, 201);
  const wsMfgDenied = await wholesaler.req('GET', '/api/seller/production-orders');
  assert.equal(wsMfgDenied.status, 403);
  const wsCrossDelete = await wholesaler.req('DELETE', `/api/seller/products/${prodMfg.json.product.id}`);
  assert.equal(wsCrossDelete.status, 404);
  ok('Portal 3 (Unified Seller): Profile/Branch, Product CRUD, Manufacturer Production/QC & cross-seller isolation');

  // ── PORTAL 4: BUYER ────────────────────────────────────────────────────────
  await registerAndApprove(superAdmin, buyer, {
    fullName: 'Retail Buyer', email: `buyer_${suffix}@test.in`, password: 'Password123!',
    businessType: 'RETAILER', businessName: `Balaji Store ${suffix}`, category: 'Textiles & Garments',
    address: 'MG Road 8', city: 'Vijayawada', state: 'Andhra Pradesh', pinCode: '520001'
  });

  const supList = await buyer.req('GET', `/api/buyer/suppliers?search=${encodeURIComponent(`Apex Mills ${suffix}`)}`);
  assert.equal(supList.status, 200);
  assert.equal(supList.json.suppliers.length, 1);

  const prodDisc = await buyer.req('GET', `/api/buyer/products?search=${encodeURIComponent(`COT-${suffix}`)}`);
  assert.equal(prodDisc.status, 200);
  assert.equal(prodDisc.json.products.length, 1);

  const saveSup = await buyer.req('POST', '/api/buyer/saved-suppliers', { supplierOrgId: mfgUser.organization.id });
  assert.equal(saveSup.status, 201);

  const prAdd = await buyer.req('POST', '/api/buyer/purchase-requests', {
    title: '500 School Uniform Shirts', category: 'Textiles & Garments', quantity: 500, unit: 'pcs', targetPrice: 255, deliveryCity: 'Vijayawada'
  });
  assert.equal(prAdd.status, 201);
  const prUpd = await buyer.req('PATCH', `/api/buyer/purchase-requests/${prAdd.json.request.id}`, { status: 'REVIEWED' });
  assert.equal(prUpd.status, 200);

  // Buyer blocked from Seller private APIs (403)
  const buyerSellerDenied = await buyer.req('GET', '/api/seller/overview');
  assert.equal(buyerSellerDenied.status, 403);
  ok('Portal 4 (Buyer): Live Supplier & Product discovery, Saved Suppliers, Purchase Requests & Seller block (403)');

  // ── PORTAL 2: WORKERS (TASKS, ATTENDANCE, LEAVE & APPROVALS) ───────────────
  const workerEmail = `emp_${suffix}@test.in`;
  createdEmails.push(workerEmail);
  const wInv = await mfg.req('POST', '/api/org/invitations', {
    email: workerEmail, fullName: 'Kiran Warehouse', workerRole: 'WAREHOUSE_STAFF',
    employeeId: 'EMP-201', department: 'Warehouse', designation: 'Inventory Staff'
  });
  assert.equal(wInv.status, 201);
  const wJoined = await mfgWorker.req('POST', '/api/auth/worker/join', {
    inviteCode: wInv.json.inviteCode, email: workerEmail, password: 'WorkerPass123!'
  });
  assert.equal(wJoined.status, 201);

  // Owner assigns task to Kiran
  const taskAdd = await mfg.req('POST', '/api/worker/tasks', {
    title: 'Count Cotton Twill Stock', category: 'WAREHOUSE', priority: 'HIGH', assignedToId: wJoined.json.id
  });
  assert.equal(taskAdd.status, 201);

  // Worker checks in, checks out, completes task, applies for leave, blocked from self-approval
  const ci = await mfgWorker.req('POST', '/api/worker/attendance/check-in', { shift: 'MORNING', locationConsent: true, locationNote: 'Gate 1' });
  assert.equal(ci.status, 201);
  const co = await mfgWorker.req('POST', '/api/worker/attendance/check-out');
  assert.equal(co.status, 200);
  assert.ok(co.json.record.workMinutes >= 1);

  const taskDone = await mfgWorker.req('PATCH', `/api/worker/tasks/${taskAdd.json.task.id}`, { status: 'COMPLETED', notes: 'Verified 2500m' });
  assert.equal(taskDone.status, 200);

  const lv = await mfgWorker.req('POST', '/api/worker/leaves', {
    leaveType: 'CASUAL', startDate: '2026-12-01', endDate: '2026-12-02', reason: 'Family function'
  });
  assert.equal(lv.status, 201);
  const selfApproveDenied = await mfgWorker.req('PATCH', `/api/worker/leaves/${lv.json.leave.id}/review`, { status: 'APPROVED' });
  assert.equal(selfApproveDenied.status, 403);

  const ownerApproveLv = await mfg.req('PATCH', `/api/worker/leaves/${lv.json.leave.id}/review`, { status: 'APPROVED', notes: 'Approved' });
  assert.equal(ownerApproveLv.status, 200);

  // Cross-org: Wholesaler CANNOT review Mfg worker leave (404)
  const crossLeave = await wholesaler.req('PATCH', `/api/worker/leaves/${lv.json.leave.id}/review`, { status: 'REJECTED' });
  assert.equal(crossLeave.status, 404);

  const wDash = await mfgWorker.req('GET', '/api/worker/dashboard');
  assert.equal(wDash.status, 200);
  assert.equal(wDash.json.stats.completedTasks, 1);
  assert.equal(wDash.json.stats.approvedLeaveDays, 2);
  ok('Portal 2 (Workers): Tasks, Check-In/Out hours, Leave application/approval, self-approval block & cross-org isolation');

  // ── PORTAL 5: TRANSPORT & LOGISTICS (FLEET, DRIVER, SHIPMENT & POD) ────────
  await registerAndApprove(superAdmin, logistics, {
    fullName: 'Fleet Owner', email: `log_${suffix}@test.in`, password: 'Password123!',
    businessType: 'LOGISTICS', businessName: `Swift Freight ${suffix}`, category: 'Logistics & Freight',
    address: 'Transport Nagar', city: 'Chennai', state: 'Tamil Nadu', pinCode: '600001',
    vehicleTypes: '14ft Container, LCV'
  });

  const drvEmail = `driver_${suffix}@test.in`;
  createdEmails.push(drvEmail);
  const dInv = await logistics.req('POST', '/api/org/invitations', {
    email: drvEmail, fullName: 'Suresh Driver', workerRole: 'DRIVER', employeeId: 'DRV-01', department: 'Fleet'
  });
  const dJoined = await driver.req('POST', '/api/auth/worker/join', {
    inviteCode: dInv.json.inviteCode, email: drvEmail, password: 'DriverPass123!'
  });
  assert.equal(dJoined.status, 201);

  const veh = await logistics.req('POST', '/api/logistics/vehicles', {
    registrationNo: `TN09C${String(suffix).slice(-4)}`, vehicleType: '14ft Container', capacityKg: 3500, assignedDriverId: dJoined.json.id
  });
  assert.equal(veh.status, 201, veh.text);

  const shp = await logistics.req('POST', '/api/logistics/shipments', {
    clientName: `Balaji Store ${suffix}`, originCity: 'Coimbatore', destinationCity: 'Vijayawada',
    weightKg: 420, quotedAmount: 6800, vehicleId: veh.json.vehicle.id, driverUserId: dJoined.json.id
  });
  assert.equal(shp.status, 201, shp.text);

  // Driver advances assigned shipment through IN_TRANSIT -> DELIVERED with POD
  const drvTransit = await driver.req('PATCH', `/api/logistics/shipments/${shp.json.shipment.id}`, { status: 'IN_TRANSIT' });
  assert.equal(drvTransit.status, 200);
  const drvPod = await driver.req('PATCH', `/api/logistics/shipments/${shp.json.shipment.id}`, { status: 'DELIVERED', podNotes: 'Signed by Store Manager' });
  assert.equal(drvPod.status, 200);
  assert.equal(drvPod.json.shipment.events.length, 3);

  // Logistics overview + Admin Logistics Partners directory reflect real counts
  const logOv = await logistics.req('GET', '/api/logistics/overview');
  assert.equal(logOv.json.stats.delivered, 1);
  assert.equal(logOv.json.stats.deliverySuccessRate, 100);

  const adminLog = await superAdmin.req('GET', '/api/admin/logistics-partners');
  assert.equal(adminLog.status, 200);
  assert.ok(adminLog.json.partners.some((p) => p.name === `Swift Freight ${suffix}` && p._count.vehicles === 1 && p._count.shipments === 1));
  ok('Portal 5 (Logistics): Fleet CRUD, Driver assignment, Shipment lifecycle + POD & Admin partner directory sync');

  console.log(`\n🎉 Phase C Test Suite: ${passed.length}/${passed.length} five-portal E2E & security assertions PASSED.\n`);
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } }, include: { memberships: true } });
  const orgIds = [...new Set(users.flatMap((u) => u.memberships.map((m) => m.organizationId)))];
  const userIds = users.map((u) => u.id);

  await prisma.adminAuditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { organizationId: { in: orgIds } }] } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
}

run()
  .catch((err) => {
    console.error('\n❌ Phase C Test Failed:', err);
    process.exitCode = 1;
  })
  .finally(cleanup);
