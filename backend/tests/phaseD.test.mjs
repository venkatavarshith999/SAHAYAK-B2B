/**
 * SAHAYAK B2B — Phase D Complete Shared Business Workflows E2E & Security Suite
 * Tests Partnerships (with Manager Review/Escalation), RFQs & Multi-Supplier Quote Comparison,
 * Persistent KAEN Negotiation (with Dual-Party Confirmation & Floor Isolation), B2B Chat (+ Attachments & 403),
 * and Orders -> Logistics Shipment -> POD -> Buyer Receipt + Order Cancellation.
 */

import assert from 'node:assert/strict';
import 'dotenv/config';
import { prisma } from '../src/config/db.js';

const BASE = 'http://localhost:4000';
const suffix = Date.now();

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body = null, { rawFormData = null } = {}) {
    const headers = { Origin: 'http://localhost:5173' };
    if (this.cookie) headers.Cookie = this.cookie;
    let payload;
    if (rawFormData) payload = rawFormData;
    else if (body !== null) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
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
  assert.ok(item);
  const appr = await admin.req('POST', `/api/admin/verifications/${item.id}/approve`, { notes: 'Phase D E2E' });
  assert.equal(appr.status, 200);
  return reg.json;
}

async function run() {
  console.log('\n🔬 Running Phase D Shared Business Workflows E2E & Security Tests...\n');

  const admin = new Client();
  const buyer = new Client();
  const wholesaler = new Client();
  const mfg = new Client();
  const mfgVerMgr = new Client();
  const logistics = new Client();

  const saLogin = await admin.req('POST', '/api/auth/login', {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@sahayak.in',
    password: process.env.TEST_ADMIN_PASSWORD || 'ChangeMe123!'
  });
  assert.equal(saLogin.status, 200, saLogin.text);

  const buyerUser = await registerAndApprove(admin, buyer, {
    fullName: 'D Buyer', email: `dbuy_${suffix}@test.in`, password: 'Password123!',
    businessType: 'RETAILER', businessName: `D Retail ${suffix}`, category: 'Textiles & Garments',
    address: 'Shop 1', city: 'Vijayawada', state: 'AP', pinCode: '520001'
  });
  const wsUser = await registerAndApprove(admin, wholesaler, {
    fullName: 'D Wholesaler', email: `dws_${suffix}@test.in`, password: 'Password123!',
    businessType: 'WHOLESALER', businessName: `D Wholesale ${suffix}`, category: 'Textiles & Garments',
    address: 'Market 2', city: 'Hyderabad', state: 'TS', pinCode: '500001', gstin: `36DWSAA${String(suffix).slice(-4)}A1Z5`
  });
  const mfgUser = await registerAndApprove(admin, mfg, {
    fullName: 'D Manufacturer', email: `dmfg_${suffix}@test.in`, password: 'Password123!',
    businessType: 'MANUFACTURER', businessName: `D Mills ${suffix}`, category: 'Textiles & Garments',
    address: 'Estate 3', city: 'Coimbatore', state: 'TN', pinCode: '641001', gstin: `33DMILL${String(suffix).slice(-4)}B1Z5`
  });
  const logUser = await registerAndApprove(admin, logistics, {
    fullName: 'D Logistics', email: `dlog_${suffix}@test.in`, password: 'Password123!',
    businessType: 'LOGISTICS', businessName: `D Freight ${suffix}`, category: 'Logistics & Freight',
    address: 'Ring Rd', city: 'Chennai', state: 'TN', pinCode: '600001'
  });

  // ── MODULE 1: PARTNERSHIPS + MANAGER REVIEW & ESCALATION ───────────────────
  const vmEmail = `dvm_${suffix}@test.in`;
  createdEmails.push(vmEmail);
  const vmInv = await mfg.req('POST', '/api/org/invitations', {
    email: vmEmail, fullName: 'Meera VerMgr', workerRole: 'VERIFICATION_MANAGER', department: 'Compliance'
  });
  assert.equal(vmInv.status, 201);
  const vmJoin = await mfgVerMgr.req('POST', '/api/auth/worker/join', {
    inviteCode: vmInv.json.inviteCode, email: vmEmail, password: 'Password123!'
  });
  assert.equal(vmJoin.status, 201);

  const partReq = await wholesaler.req('POST', '/api/partnerships', {
    targetOrgId: mfgUser.organization.id,
    relationshipType: 'WHOLESALER_MANUFACTURER',
    message: 'Looking for 2,000 meters/month supply',
    commercialTerms: 'Net 30'
  });
  assert.equal(partReq.status, 201, partReq.text);
  const partId = partReq.json.partnership.id;

  // Verification Manager requests info (200), is blocked from direct APPROVE (403), then escalates to Owner (200)
  const vmInfo = await mfgVerMgr.req('PATCH', `/api/partnerships/${partId}/review`, { action: 'REQUEST_INFO', notes: 'Share 2 trade references' });
  assert.equal(vmInfo.status, 200);
  const vmApproveDenied = await mfgVerMgr.req('PATCH', `/api/partnerships/${partId}/review`, { action: 'APPROVE', notes: 'Try bypass' });
  assert.equal(vmApproveDenied.status, 403);
  const wsReply = await wholesaler.req('POST', `/api/partnerships/${partId}/respond`, { response: 'Ref 1: Apex Retail, Ref 2: Metro Mart' });
  assert.equal(wsReply.status, 200);
  const vmEsc = await mfgVerMgr.req('PATCH', `/api/partnerships/${partId}/review`, { action: 'ESCALATE_TO_OWNER', notes: 'Docs verified, recommend approval' });
  assert.equal(vmEsc.status, 200);
  const ownerApprove = await mfg.req('PATCH', `/api/partnerships/${partId}/review`, { action: 'APPROVE', notes: 'Approved for Q4 supply' });
  assert.equal(ownerApprove.status, 200);
  assert.equal(ownerApprove.json.partnership.status, 'APPROVED');
  ok('Module 1 (Partnerships): Wholesaler→Manufacturer request, Manager info/403-block/escalate & Owner approval');

  // ── MODULE 2: RFQs & MULTI-SUPPLIER QUOTE COMPARISON + PRIVACY ─────────────
  const rfqRes = await buyer.req('POST', '/api/rfqs', {
    title: 'Uniform Batch Q4', productName: 'Cotton Uniform Shirt', category: 'Textiles & Garments',
    quantity: 500, unit: 'pcs', targetMaxPrice: 280, deliveryCity: 'Vijayawada',
    targetSellerOrgIds: [wsUser.organization.id, mfgUser.organization.id]
  });
  assert.equal(rfqRes.status, 201, rfqRes.text);
  const rfqId = rfqRes.json.rfq.id;

  const qMfg = await mfg.req('POST', `/api/rfqs/${rfqId}/quotations`, {
    availableQty: 500, unitPrice: 290, moq: 100, taxRatePct: 12, deliveryCharge: 2000, estimatedDeliveryDays: 6, paymentTerms: 'Net 15'
  });
  assert.equal(qMfg.status, 201);
  const qWs = await wholesaler.req('POST', `/api/rfqs/${rfqId}/quotations`, {
    availableQty: 500, unitPrice: 270, moq: 50, taxRatePct: 12, deliveryCharge: 1500, estimatedDeliveryDays: 4, paymentTerms: 'Net 15'
  });
  assert.equal(qWs.status, 201);

  // Competitor privacy check: Wholesaler only sees OWN quotation on incoming RFQ!
  const wsIncoming = await wholesaler.req('GET', '/api/rfqs?view=incoming');
  const wsRfqRow = wsIncoming.json.rfqs.find((r) => r.id === rfqId);
  assert.equal(wsRfqRow.quotations.length, 1);
  assert.equal(wsRfqRow.quotations[0].sellerOrgId, wsUser.organization.id);

  // Wholesaler revises quote down to ₹265
  const qWsRev = await wholesaler.req('PATCH', `/api/rfqs/quotations/${qWs.json.quotation.id}`, { unitPrice: 265 });
  assert.equal(qWsRev.status, 200);
  assert.equal(qWsRev.json.quotation.revision, 2);

  // Buyer sees BOTH quotes sorted ascending by totalAmount
  const buyerRfqs = await buyer.req('GET', '/api/rfqs?view=outgoing');
  const myRfq = buyerRfqs.json.rfqs.find((r) => r.id === rfqId);
  assert.equal(myRfq.quotations.length, 2);
  assert.ok(myRfq.quotations[0].totalAmount < myRfq.quotations[1].totalAmount);
  ok('Module 2 (RFQs & Quotes): Multi-supplier dispatch, competitor quote privacy, revision & landed-cost comparison');

  // ── MODULE 3: PERSISTENT KAEN NEGOTIATION + DUAL CONFIRMATION ──────────────
  const kaenStart = await buyer.req('POST', '/api/kaen/sessions', {
    quotationId: qWs.json.quotation.id, buyerOffer: 245, deliveryTerms: 'Door delivery Vijayawada'
  });
  assert.equal(kaenStart.status, 201, kaenStart.text);
  assert.equal(kaenStart.json.session.sellerFloorPrice, undefined, 'Buyer must NEVER see private sellerFloorPrice');
  const sessionId = kaenStart.json.session.id;

  const r2 = await buyer.req('POST', `/api/kaen/sessions/${sessionId}/offer`, {
    proposedPrice: 255, proposedQty: 500, message: 'Can close today at ₹255'
  });
  assert.equal(r2.status, 200);
  assert.equal(r2.json.session.rounds.length, 2);

  // Buyer confirms first -> still AWAITING_CONFIRMATION -> cannot create order yet (400)
  const bConf = await buyer.req('POST', `/api/kaen/sessions/${sessionId}/confirm`);
  assert.equal(bConf.status, 200);
  assert.equal(bConf.json.session.status, 'AWAITING_CONFIRMATION');
  const earlyOrder = await buyer.req('POST', `/api/orders/from-negotiation/${sessionId}`);
  assert.equal(earlyOrder.status, 400);

  // Seller confirms -> status AGREED + immutable agreedTermsSnapshot locked!
  const sConf = await wholesaler.req('POST', `/api/kaen/sessions/${sessionId}/confirm`);
  assert.equal(sConf.status, 200);
  assert.equal(sConf.json.session.status, 'AGREED');
  assert.ok(sConf.json.session.agreedTermsSnapshot?.lockedAt);
  ok('Module 3 (Persistent KAEN): Floor isolation, multi-round history, dual-party confirmation & immutable snapshot');

  // ── MODULE 4: SHARED B2B CHAT + ATTACHMENTS + CROSS-ORG 403 ────────────────
  const convRes = await buyer.req('POST', '/api/chat/conversations', { targetOrgId: wsUser.organization.id, subject: 'Uniform RFQ' });
  assert.equal(convRes.status, 201);
  const convId = convRes.json.conversation.id;

  const fd = new FormData();
  fd.append('body', 'Attached size breakdown PDF for the agreed order');
  fd.append('refType', 'RFQ');
  fd.append('refLabel', rfqRes.json.rfq.rfqNumber);
  fd.append('file', new Blob(['%PDF-1.4 size chart'], { type: 'application/pdf' }), 'size-chart.pdf');
  const sentMsg = await buyer.req('POST', `/api/chat/conversations/${convId}/messages`, null, { rawFormData: fd });
  assert.equal(sentMsg.status, 201, sentMsg.text);
  const msgId = sentMsg.json.message.id;

  // Wholesaler reads messages & downloads attachment (200)
  const wsMsgs = await wholesaler.req('GET', `/api/chat/conversations/${convId}/messages`);
  assert.equal(wsMsgs.status, 200);
  assert.equal(wsMsgs.json.messages.length, 1);
  const wsAtt = await wholesaler.req('GET', `/api/chat/messages/${msgId}/attachment`);
  assert.equal(wsAtt.status, 200);

  // Manufacturer (third-party org) blocked from reading messages or attachment (403)
  const thirdPartyMsgs = await mfg.req('GET', `/api/chat/conversations/${convId}/messages`);
  assert.equal(thirdPartyMsgs.status, 403);
  const thirdPartyAtt = await mfg.req('GET', `/api/chat/messages/${msgId}/attachment`);
  assert.equal(thirdPartyAtt.status, 403);
  ok('Module 4 (B2B Chat): Messaging, RFQ reference, PDF attachment download & third-party org isolation (403)');

  // ── MODULE 5: ORDERS -> LOGISTICS DISPATCH -> DELIVERY SYNC -> RECEIPT ─────
  const ordRes = await buyer.req('POST', `/api/orders/from-negotiation/${sessionId}`);
  assert.equal(ordRes.status, 201, ordRes.text);
  const orderId = ordRes.json.order.id;

  // Seller confirms order & marks payment PAID
  const ordConf = await wholesaler.req('PATCH', `/api/orders/${orderId}/status`, { status: 'CONFIRMED', paymentStatus: 'PAID' });
  assert.equal(ordConf.status, 200);

  // Seller dispatches to Logistics Partner -> creates real linked Shipment
  const shipReq = await wholesaler.req('POST', `/api/orders/${orderId}/request-shipment`, {
    logisticsOrgId: logUser.organization.id, weightKg: 180, quotedAmount: 3200
  });
  assert.equal(shipReq.status, 201, shipReq.text);
  const shipmentId = shipReq.json.shipment.id;

  // Logistics partner marks Shipment IN_TRANSIT -> DELIVERED (syncs linked Order to DELIVERED!)
  const logTransit = await logistics.req('PATCH', `/api/logistics/shipments/${shipmentId}`, { status: 'IN_TRANSIT' });
  assert.equal(logTransit.status, 200);
  const logDel = await logistics.req('PATCH', `/api/logistics/shipments/${shipmentId}`, { status: 'DELIVERED', podNotes: 'Delivered intact' });
  assert.equal(logDel.status, 200);

  // Buyer confirms receipt -> RECEIPT_CONFIRMED
  const receipt = await buyer.req('PATCH', `/api/orders/${orderId}/status`, { status: 'RECEIPT_CONFIRMED' });
  assert.equal(receipt.status, 200);
  assert.equal(receipt.json.order.status, 'RECEIPT_CONFIRMED');

  // Test Order Cancellation workflow on a 2nd RFQ -> Accept Quotation -> Order -> Cancel
  const rfq2 = await buyer.req('POST', '/api/rfqs', {
    title: 'Sample Cancel Test', productName: 'Cotton Ties', category: 'Textiles & Garments',
    quantity: 100, unit: 'pcs', deliveryCity: 'Vijayawada', targetSellerOrgIds: [mfgUser.organization.id]
  });
  const q2 = await mfg.req('POST', `/api/rfqs/${rfq2.json.rfq.id}/quotations`, {
    availableQty: 100, unitPrice: 90, moq: 10, taxRatePct: 12, deliveryCharge: 500
  });
  await buyer.req('POST', `/api/rfqs/quotations/${q2.json.quotation.id}/accept`);
  const ord2 = await buyer.req('POST', `/api/orders/from-quotation/${q2.json.quotation.id}`);
  assert.equal(ord2.status, 201);
  const cancelNoReason = await buyer.req('PATCH', `/api/orders/${ord2.json.order.id}/status`, { status: 'CANCELLED' });
  assert.equal(cancelNoReason.status, 400);
  const cancelOk = await buyer.req('PATCH', `/api/orders/${ord2.json.order.id}/status`, { status: 'CANCELLED', reason: 'Spec changed' });
  assert.equal(cancelOk.status, 200);
  assert.equal(cancelOk.json.order.status, 'CANCELLED');

  // Super Admin Transactions view reflects real GMV & order counts
  const adminOrds = await admin.req('GET', '/api/admin/orders');
  assert.equal(adminOrds.status, 200);
  assert.ok(adminOrds.json.summary.totalOrders >= 2);
  assert.ok(adminOrds.json.summary.gmv > 0);
  ok('Module 5 (Orders & Dispatch): KAEN→Order→Logistics Delivery Sync→Buyer Receipt, Cancellation & Admin GMV');

  console.log(`\n🎉 Phase D Test Suite: ${passed.length}/${passed.length} shared workflow & security assertions PASSED.\n`);
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
    console.error('\n❌ Phase D Test Failed:', err);
    process.exitCode = 1;
  })
  .finally(cleanup);
