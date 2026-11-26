/**
 * SAHAYAK B2B — Master Stabilization Regression, Session-Isolation & Security Suite (Tests A–J)
 *
 * Covers:
 *  - Test A: Buyer / Retailer end-to-end registration, verification, approval, routing & RBAC
 *  - Test B: Seller / Wholesaler end-to-end flow & Seller Portal routing
 *  - Test C: Manufacturer end-to-end flow & Manufacturer Workspace inside Seller Portal
 *  - Test D: Trader / Distributor end-to-end flow & Distributor Workspace inside Seller Portal
 *  - Test E: Transport / Logistics end-to-end flow & Transport & Logistics Portal routing
 *  - Test F: Worker invite-only join, org scoping, dedicated login & restricted owner/admin APIs
 *  - Test G & H: Admin Session Isolation & Concurrent Multi-Session Safety + Cross-Org Isolation + Role Tampering Defense
 *  - Test I: Google OAuth HTTP handshake, state validation, error handling & portal routing
 *  - Test J: SAHAYAK AI Co-Pilot endpoint validation, cross-user conversation isolation, live Gemini call & preserved KAEN check
 *
 * Strictly preserves all existing database records; deletes ONLY synthetic test records created in this run.
 */

import assert from 'node:assert/strict';
import 'dotenv/config';
import { prisma } from '../src/config/db.js';
import { hashPassword } from '../src/auth/authService.js';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:4000';
const ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const ts = Date.now();

class CookieClient {
  constructor() {
    this.cookies = new Map();
  }

  cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  captureCookies(res) {
    const rawList = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie')]
        : [];
    for (const raw of rawList) {
      const m = raw.match(/^([^=]+)=([^;]*)/);
      if (!m) continue;
      const [, name, value] = m;
      if (!value || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(raw)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
    return rawList;
  }

  async req(method, path, body = null, { redirect = 'follow' } = {}) {
    const headers = { Origin: ORIGIN };
    const ck = this.cookieHeader();
    if (ck) headers.Cookie = ck;
    let payload;
    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}${path}`, { method, headers, body: payload, redirect });
    const setCookies = this.captureCookies(res);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text, headers: res.headers, setCookies };
  }
}

const createdEmails = [];
let passed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}\n     -> ${err.message}`);
    throw err;
  }
}

function makeBizPayload(role, tag, { gstRequired = false } = {}) {
  const email = `stab_${tag}_${ts}@sahayak-test.in`;
  createdEmails.push(email);
  const randNum = String(Math.floor(1000 + Math.random() * 9000));
  return {
    fullName: `${tag} Owner`,
    businessName: `${tag} Enterprise ${ts}`,
    email,
    phone: `9${String(ts).slice(-5)}${randNum}`,
    password: 'StrongPassword#2026',
    role,
    businessType: role,
    category: 'Textiles & Garments',
    address: '101 Trade Corridor',
    city: 'Hyderabad',
    state: 'Telangana',
    pinCode: '500001',
    ...(gstRequired ? { gstin: `36AAB${tag.slice(0, 2).toUpperCase()}${randNum}F1Z5` } : {})
  };
}

async function registerAndVerifyRoleFlow(adminClient, adminUserId, { role, tag, gstRequired, expectedPortal, expectedWorkspace, expectedRoute }) {
  const payload = makeBizPayload(role, tag, { gstRequired });
  const applicantClient = new CookieClient();

  // 1. Register
  const reg = await applicantClient.req('POST', '/api/auth/register', payload);
  assert.equal(reg.status, 201, `Register ${role} failed: ${reg.text}`);
  assert.equal(reg.json.role, role);
  assert.equal(reg.json.status, 'PENDING_VERIFICATION');
  assert.equal(reg.json.portalDestination.route, '/pending');

  // 2. Confirm request appears in Admin queue
  const queueRes = await adminClient.req('GET', '/api/admin/verifications');
  assert.equal(queueRes.status, 200);
  const vItem = queueRes.json.find((v) => v.business?.user?.email === payload.email);
  assert.ok(vItem, `Verification request for ${role} must appear in Admin queue`);

  // 3. Approve as Super Admin — confirm ZERO Set-Cookie header returned and Admin session untouched
  const appr = await adminClient.req('POST', `/api/admin/verifications/${vItem.id}/approve`, {
    notes: `Approved ${role} in stabilization test`
  });
  assert.equal(appr.status, 200, `Approve ${role} failed: ${appr.text}`);
  assert.equal(appr.setCookies.length, 0, 'Approval API must NEVER emit Set-Cookie headers');
  assert.equal(appr.json.status, 'ACTIVE');
  assert.equal(appr.json.previousStatus, 'PENDING_VERIFICATION');
  assert.equal(appr.json.applicant.userId, reg.json.id);
  assert.equal(appr.json.applicant.role, role);

  // 4. Confirm Super Admin session remained completely unchanged
  const adminMe = await adminClient.req('GET', '/api/me');
  assert.equal(adminMe.status, 200);
  assert.equal(adminMe.json.id, adminUserId);
  assert.equal(adminMe.json.role, 'SUPER_ADMIN');
  assert.equal(adminMe.json.portalDestination.portal, 'ADMIN');
  assert.equal(adminMe.json.portalDestination.route, '/dashboard/admin');

  // 5. Applicant logs in fresh in an isolated session with their own credentials
  const freshApplicant = new CookieClient();
  const login = await freshApplicant.req('POST', '/api/auth/login', {
    email: payload.email,
    password: payload.password
  });
  assert.equal(login.status, 200, `Fresh login for ${role} failed: ${login.text}`);
  assert.equal(login.json.id, reg.json.id);
  assert.equal(login.json.role, role, 'Applicant role must remain unchanged after approval');
  assert.equal(login.json.status, 'ACTIVE');
  assert.equal(login.json.organization.businessType, role, 'Organization businessType must remain unchanged');
  assert.equal(login.json.portalDestination.portal, expectedPortal);
  assert.equal(login.json.portalDestination.workspace, expectedWorkspace);
  assert.equal(login.json.portalDestination.route, expectedRoute);

  // 6. Applicant MUST be rejected from Super Admin APIs & self-approval
  const adminAttempt = await freshApplicant.req('GET', '/api/admin/stats');
  assert.equal(adminAttempt.status, 403, `${role} must get 403 on /api/admin/stats`);
  const selfApprove = await freshApplicant.req('POST', `/api/admin/verifications/${vItem.id}/approve`, { notes: 'Self' });
  assert.equal(selfApprove.status, 403, `${role} must get 403 on verification approval`);

  return { client: freshApplicant, user: login.json, payload, verificationId: vItem.id };
}

async function cleanup() {
  if (!createdEmails.length) return;
  const users = await prisma.user.findMany({
    where: { email: { in: createdEmails } },
    include: { memberships: true }
  });
  const userIds = users.map((u) => u.id);
  const orgIds = Array.from(new Set(users.flatMap((u) => u.memberships.map((m) => m.organizationId))));

  if (userIds.length) {
    await prisma.adminAuditLog.deleteMany({ where: { actorId: { in: userIds } } }).catch(() => {});
    await prisma.aiUsage.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.conversation.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.loginHistory.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.oAuthAccount.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  }
  if (orgIds.length) {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } }).catch(() => {});
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  }
}

console.log('\n🛡️  Running SAHAYAK B2B Full Stabilization Regression Suite (Tests A–J)...\n');

const testAdminEmail = `stab_admin_${ts}@sahayak-test.in`;
const testAdminPwd = 'AdminTestSecret#2026';
createdEmails.push(testAdminEmail);

try {
  // Bootstrap dedicated synthetic Super Admin for this test run (never uses real production admin)
  const adminHash = await hashPassword(testAdminPwd);
  const testAdmin = await prisma.user.create({
    data: {
      email: testAdminEmail,
      fullName: 'Synthetic Test Super Admin',
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true
    }
  });

  const adminClient = new CookieClient();
  const adminLogin = await adminClient.req('POST', '/api/auth/login', {
    email: testAdminEmail,
    password: testAdminPwd
  });
  assert.equal(adminLogin.status, 200, 'Synthetic Super Admin login failed');
  assert.equal(adminLogin.json.portalDestination.route, '/dashboard/admin');

  let buyerCtx;
  let wholesalerCtx;
  let manufacturerCtx;
  let distributorCtx;
  let logisticsCtx;

  await test('Test A — Buyer / Retailer registers, gets approved, enters Buyer Portal, blocked from Admin/Seller APIs', async () => {
    buyerCtx = await registerAndVerifyRoleFlow(adminClient, testAdmin.id, {
      role: 'RETAILER',
      tag: 'buyer',
      gstRequired: false,
      expectedPortal: 'BUYER',
      expectedWorkspace: 'BUYER',
      expectedRoute: '/dashboard/buyer'
    });
    const ov = await buyerCtx.client.req('GET', '/api/buyer/overview');
    assert.equal(ov.status, 200);
    const sellerDeny = await buyerCtx.client.req('GET', '/api/seller/overview');
    assert.equal(sellerDeny.status, 403);
    const logDeny = await buyerCtx.client.req('GET', '/api/logistics/overview');
    assert.equal(logDeny.status, 403);

    // Verify Audit Log recorded Admin as actorId and Buyer as applicantUserId
    const audit = await prisma.adminAuditLog.findFirst({
      where: { targetId: buyerCtx.verificationId, action: 'APPROVE_KYC' },
      orderBy: { createdAt: 'desc' }
    });
    assert.ok(audit, 'APPROVE_KYC audit entry must exist');
    assert.equal(audit.actorId, testAdmin.id);
    assert.equal(audit.details.applicantUserId, buyerCtx.user.id);
    assert.equal(audit.details.previousStatus, 'PENDING_VERIFICATION');
    assert.equal(audit.details.newStatus, 'ACTIVE');
  });

  await test('Test B — Seller / Wholesaler registers, gets approved, enters Seller Portal, blocked from Manufacturer & Admin APIs', async () => {
    wholesalerCtx = await registerAndVerifyRoleFlow(adminClient, testAdmin.id, {
      role: 'WHOLESALER',
      tag: 'whol',
      gstRequired: true,
      expectedPortal: 'SELLER',
      expectedWorkspace: 'SELLER',
      expectedRoute: '/dashboard/seller'
    });
    const ov = await wholesalerCtx.client.req('GET', '/api/seller/overview');
    assert.equal(ov.status, 200);
    assert.equal(ov.json.businessType, 'WHOLESALER');
    const prodDeny = await wholesalerCtx.client.req('GET', '/api/seller/production-orders');
    assert.equal(prodDeny.status, 403);
    const buyerDeny = await wholesalerCtx.client.req('GET', '/api/buyer/overview');
    assert.equal(buyerDeny.status, 403);
  });

  await test('Test C — Manufacturer registers, gets approved, enters Manufacturer Workspace inside Seller Portal', async () => {
    manufacturerCtx = await registerAndVerifyRoleFlow(adminClient, testAdmin.id, {
      role: 'MANUFACTURER',
      tag: 'mfg',
      gstRequired: true,
      expectedPortal: 'SELLER',
      expectedWorkspace: 'MANUFACTURER',
      expectedRoute: '/dashboard/seller'
    });
    const ov = await manufacturerCtx.client.req('GET', '/api/seller/overview');
    assert.equal(ov.status, 200);
    assert.equal(ov.json.businessType, 'MANUFACTURER');
    const prodOk = await manufacturerCtx.client.req('GET', '/api/seller/production-orders');
    assert.equal(prodOk.status, 200);
  });

  await test('Test D — Trader / Distributor registers, gets approved, enters Distributor Workspace inside Seller Portal', async () => {
    distributorCtx = await registerAndVerifyRoleFlow(adminClient, testAdmin.id, {
      role: 'DISTRIBUTOR',
      tag: 'dist',
      gstRequired: true,
      expectedPortal: 'SELLER',
      expectedWorkspace: 'DISTRIBUTOR',
      expectedRoute: '/dashboard/seller'
    });
    const ov = await distributorCtx.client.req('GET', '/api/seller/overview');
    assert.equal(ov.status, 200);
    assert.equal(ov.json.businessType, 'DISTRIBUTOR');
  });

  await test('Test E — Transport / Logistics registers, gets approved, enters Transport & Logistics Portal', async () => {
    logisticsCtx = await registerAndVerifyRoleFlow(adminClient, testAdmin.id, {
      role: 'LOGISTICS',
      tag: 'logi',
      gstRequired: false,
      expectedPortal: 'LOGISTICS',
      expectedWorkspace: 'LOGISTICS',
      expectedRoute: '/dashboard/logistics'
    });
    const ov = await logisticsCtx.client.req('GET', '/api/logistics/overview');
    assert.equal(ov.status, 200);
    const sellerDeny = await logisticsCtx.client.req('GET', '/api/seller/overview');
    assert.equal(sellerDeny.status, 403);
  });

  await test('Test F — Worker joins via invite code, enters Workers Portal, restricted from owner & admin APIs', async () => {
    const workerEmail = `stab_worker_${ts}@sahayak-test.in`;
    createdEmails.push(workerEmail);

    const invRes = await wholesalerCtx.client.req('POST', '/api/org/invitations', {
      email: workerEmail,
      fullName: 'Warehouse Staff Worker',
      workerRole: 'WAREHOUSE_STAFF',
      department: 'Warehouse'
    });
    assert.equal(invRes.status, 201, `Invite failed: ${invRes.text}`);

    const workerClient = new CookieClient();
    const joinRes = await workerClient.req('POST', '/api/auth/worker/join', {
      inviteCode: invRes.json.inviteCode,
      email: workerEmail,
      password: 'WorkerPassword#2026'
    });
    assert.equal(joinRes.status, 201, `Worker join failed: ${joinRes.text}`);
    assert.equal(joinRes.json.role, 'WORKER');
    assert.equal(joinRes.json.portalDestination.portal, 'WORKER');
    assert.equal(joinRes.json.portalDestination.route, '/dashboard/worker');

    // Worker cannot log in through business/admin login endpoint
    const wrongLogin = await new CookieClient().req('POST', '/api/auth/login', {
      email: workerEmail,
      password: 'WorkerPassword#2026'
    });
    assert.equal(wrongLogin.status, 403);

    // Worker login through dedicated worker endpoint works
    const workerLogin = await new CookieClient().req('POST', '/api/auth/worker/login', {
      email: workerEmail,
      password: 'WorkerPassword#2026'
    });
    assert.equal(workerLogin.status, 200);
    assert.equal(workerLogin.json.portalDestination.route, '/dashboard/worker');

    // Worker dashboard allowed; owner-only org edit & admin APIs blocked (403)
    const wDash = await workerClient.req('GET', '/api/worker/dashboard');
    assert.equal(wDash.status, 200);
    const ownerOnly = await workerClient.req('PATCH', '/api/org/profile', { name: 'Hijack Org' });
    assert.equal(ownerOnly.status, 403);
    const adminDeny = await workerClient.req('GET', '/api/admin/stats');
    assert.equal(adminDeny.status, 403);
  });

  await test('Test G & H — Concurrent Admin + Buyer sessions stay 100% isolated during & after approval + Cross-org & role-tampering defense', async () => {
    const concPayload = makeBizPayload('RETAILER', 'conc', { gstRequired: false });
    const concBuyer = new CookieClient();

    const reg = await concBuyer.req('POST', '/api/auth/register', concPayload);
    assert.equal(reg.status, 201);

    // Pending buyer cannot access active buyer overview
    const blockedBefore = await concBuyer.req('GET', '/api/buyer/overview');
    assert.equal(blockedBefore.status, 403);

    // Admin concurrently approves buyer
    const q = await adminClient.req('GET', '/api/admin/verifications');
    const item = q.json.find((v) => v.business?.user?.email === concPayload.email);
    assert.ok(item);
    const appr = await adminClient.req('POST', `/api/admin/verifications/${item.id}/approve`, { notes: 'Concurrent approval' });
    assert.equal(appr.status, 200);

    // Refresh BOTH concurrent sessions simultaneously
    const [adminAfter, buyerAfter] = await Promise.all([
      adminClient.req('GET', '/api/me'),
      concBuyer.req('GET', '/api/me')
    ]);
    assert.equal(adminAfter.json.id, testAdmin.id);
    assert.equal(adminAfter.json.role, 'SUPER_ADMIN');
    assert.equal(adminAfter.json.portalDestination.route, '/dashboard/admin');

    assert.equal(buyerAfter.json.id, reg.json.id);
    assert.equal(buyerAfter.json.role, 'RETAILER');
    assert.equal(buyerAfter.json.status, 'ACTIVE');
    assert.equal(buyerAfter.json.portalDestination.portal, 'BUYER');
    assert.equal(buyerAfter.json.portalDestination.route, '/dashboard/buyer');

    // Buyer now enters Buyer Portal cleanly, still blocked from Admin APIs
    assert.equal((await concBuyer.req('GET', '/api/buyer/overview')).status, 200);
    assert.equal((await concBuyer.req('GET', '/api/admin/stats')).status, 403);

    // Public role tampering to SUPER_ADMIN rejected
    const hijackPayload = makeBizPayload('RETAILER', 'tamper', { gstRequired: false });
    hijackPayload.role = 'SUPER_ADMIN';
    hijackPayload.businessType = 'SUPER_ADMIN';
    const hijackRes = await new CookieClient().req('POST', '/api/auth/register', hijackPayload);
    assert.equal(hijackRes.status, 400);

    // Cross-organization product isolation: Manufacturer creates product, Wholesaler cannot edit/delete it
    const mfgProd = await manufacturerCtx.client.req('POST', '/api/seller/products', {
      sku: `MFG-${ts}`,
      name: 'Factory Cotton Roll',
      category: 'Textiles & Garments',
      unitPrice: 450,
      moq: 10,
      stockQty: 500
    });
    assert.equal(mfgProd.status, 201);
    const crossEdit = await wholesalerCtx.client.req('PATCH', `/api/seller/products/${mfgProd.json.product.id}`, {
      unitPrice: 1
    });
    assert.equal(crossEdit.status, 404, 'Wholesaler must not modify Manufacturer organization product');
  });

  await test('Test I — Google OAuth HTTP status, redirect handshake, state validation & cancellation safety', async () => {
    const anon = new CookieClient();
    const st = await anon.req('GET', '/api/auth/google/status');
    assert.equal(st.status, 200);
    assert.equal(st.json.configured, true);
    assert.equal(st.json.callbackPath, '/api/auth/google/callback');
    assert.ok(st.json.redirectUri.endsWith('/api/auth/google/callback'));
    assert.ok(!st.text.includes('GOCSPX'));

    const redir = await anon.req('GET', '/api/auth/google/redirect', null, { redirect: 'manual' });
    assert.equal(redir.status, 302);
    const locUrl = new URL(redir.headers.get('location'));
    assert.equal(locUrl.origin, 'https://accounts.google.com');
    assert.equal(locUrl.searchParams.get('redirect_uri'), st.json.redirectUri);

    const badState = await new CookieClient().req('GET', '/api/auth/google/callback?code=abc&state=bad', null, { redirect: 'manual' });
    assert.equal(badState.status, 302);
    assert.ok((badState.headers.get('location') || '').includes('error=google_state_invalid'));

    const cancelled = await new CookieClient().req('GET', '/api/auth/google/callback?error=access_denied', null, { redirect: 'manual' });
    assert.equal(cancelled.status, 302);
    assert.ok((cancelled.headers.get('location') || '').includes('error=google_cancelled'));
  });

  await test('Test J — SAHAYAK AI validation, cross-user conversation isolation, live Gemini call & preserved KAEN engine', async () => {
    // Unauthenticated blocked
    assert.equal((await new CookieClient().req('POST', '/api/ai/chat', { prompt: 'Hi' })).status, 401);

    // Empty prompt cleanly rejected (400, no raw JSON)
    const emptyRes = await buyerCtx.client.req('POST', '/api/ai/chat', { prompt: '   ' });
    assert.equal(emptyRes.status, 400);
    assert.equal(emptyRes.json.code, 'AI_EMPTY_PROMPT');

    // Preserved KAEN negotiation engine still works identically
    const kaenRes = await buyerCtx.client.req('POST', '/api/kaen/negotiate', {
      round: 1,
      maxRounds: 5,
      buyerOffer: 260,
      buyerMaxPrice: 285,
      sellerAsk: 300,
      sellerFloorPrice: 270,
      quantity: 500
    });
    assert.equal(kaenRes.status, 200);
    assert.ok(['COUNTER_OFFER', 'ACCEPTED', 'ESCALATED_TO_HUMAN'].includes(kaenRes.json.status));

    // Real live Gemini API E2E check through /api/ai/chat (when RUN_LIVE_GEMINI=1)
    if (process.env.RUN_LIVE_GEMINI === '1') {
      const liveAi = await buyerCtx.client.req('POST', '/api/ai/chat', {
        prompt: 'Give one short tip for comparing two B2B textile quotations.'
      });
      assert.equal(liveAi.status, 200, `Live /api/ai/chat failed: ${liveAi.text}`);
      assert.ok(liveAi.json.text && liveAi.json.text.length > 10);
      assert.ok(liveAi.json.conversationId);
      assert.ok(liveAi.json.usage.totalTokens > 0);
      console.log(`     [Live /api/ai/chat] model=${liveAi.json.model}, latency=${liveAi.json.latencyMs}ms, tokens=${liveAi.json.usage.totalTokens}`);

      // Cross-organization/cross-user conversation isolation: Wholesaler cannot read Buyer's AI conversation
      const crossConv = await wholesalerCtx.client.req('GET', `/api/conversations/${liveAi.json.conversationId}/messages`);
      assert.equal(crossConv.status, 404, 'Another user/org must NOT access Buyer AI conversation messages');
    } else {
      console.log('     ⏭️  Skipped live /api/ai/chat call (set RUN_LIVE_GEMINI=1 to run)');
    }
  });

  console.log(`\n🎉 Full Stabilization Regression Suite PASSED (${passed}/9 test groups covering Tests A–J)\n`);
} finally {
  await cleanup();
  await prisma.$disconnect();
}
