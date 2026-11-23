/**
 * SAHAYAK B2B — Phase B Automated Auth, Org Isolation & Security Integration Tests
 * Runs against the live backend at http://localhost:4000 and cleans up all test records afterward.
 */

import assert from 'node:assert/strict';
import 'dotenv/config';
import { prisma } from '../src/config/db.js';

const BASE = 'http://localhost:4000';
const suffix = Date.now();

class CookieClient {
  constructor() {
    this.cookie = '';
  }
  async req(method, path, body = null, { origin = 'http://localhost:5173', rawFormData = null } = {}) {
    const headers = {};
    if (origin !== null) headers.Origin = origin;
    if (this.cookie) headers.Cookie = this.cookie;
    let payload;
    if (rawFormData) {
      payload = rawFormData;
    } else if (body !== null) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = setCookie.match(/sahayak_session=([^;]+)/);
      if (m) this.cookie = `sahayak_session=${m[1]}`;
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  }
}

const createdEmails = [];
const results = [];
function pass(name) {
  results.push({ name, ok: true });
  console.log(`  ✅ ${name}`);
}

async function run() {
  console.log('\n🔬 Running Phase B Auth, RBAC, Upload & Org-Isolation Tests...\n');

  const admin = new CookieClient();
  const orgA = new CookieClient();
  const orgB = new CookieClient();
  const workerA = new CookieClient();
  const anon = new CookieClient();

  // 1. Health check (live DB)
  const health = await anon.req('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.database, 'connected');
  pass('GET /api/health confirms live PostgreSQL connection');

  // 2. Unauthenticated blocked from protected routes
  const unauthAdmin = await anon.req('GET', '/api/admin/stats');
  assert.equal(unauthAdmin.status, 401);
  const unauthMe = await anon.req('GET', '/api/me');
  assert.equal(unauthMe.status, 401);
  pass('Unauthenticated requests blocked with 401');

  // 3. Cross-origin CSRF blocked
  const csrfRes = await anon.req('POST', '/api/auth/login', { email: 'a@b.com', password: 'password123' }, { origin: 'https://evil-attacker.example' });
  assert.equal(csrfRes.status, 403);
  pass('Cross-origin mutating request blocked with 403 (CSRF guard)');

  // 4. Reject public registration as ADMIN or WORKER
  const badAdminReg = await anon.req('POST', '/api/auth/register', {
    fullName: 'Fake Admin', email: `fakeadmin_${suffix}@test.in`, password: 'Password123!',
    role: 'SUPER_ADMIN', businessName: 'Evil Corp', category: 'Other',
    address: '123 St', city: 'Hyd', state: 'TS', pinCode: '500001'
  });
  assert.equal(badAdminReg.status, 400);
  const badWorkerReg = await anon.req('POST', '/api/auth/register', {
    fullName: 'Solo Worker', email: `soloworker_${suffix}@test.in`, password: 'Password123!',
    role: 'WORKER', businessName: 'No Org', category: 'Other',
    address: '123 St', city: 'Hyd', state: 'TS', pinCode: '500001'
  });
  assert.equal(badWorkerReg.status, 400);
  pass('Public registration rejects SUPER_ADMIN and WORKER roles (400)');

  // 5. Conditional GSTIN enforcement (Manufacturer requires GSTIN)
  const noGstMfg = await anon.req('POST', '/api/auth/register', {
    fullName: 'No GST Mfg', email: `nogst_${suffix}@test.in`, password: 'Password123!',
    businessType: 'MANUFACTURER', businessName: 'Mfg Without GST', category: 'Textiles & Garments',
    address: 'Plot 9', city: 'Surat', state: 'GJ', pinCode: '395001'
  });
  assert.equal(noGstMfg.status, 400);
  pass('Conditional regulatory rule enforces GSTIN for Manufacturer accounts (400)');

  // 6. Register Org A (Manufacturer with GSTIN)
  const emailA = `mfg_a_${suffix}@test.in`;
  createdEmails.push(emailA);
  const regA = await orgA.req('POST', '/api/auth/register', {
    fullName: 'Owner A', email: emailA, phone: `91${String(suffix).slice(-8)}`, password: 'Password123!',
    businessType: 'MANUFACTURER', businessName: `Org A Textiles ${suffix}`, category: 'Textiles & Garments',
    address: 'Industrial Estate 1', city: 'Coimbatore', district: 'Coimbatore', state: 'Tamil Nadu', pinCode: '641001',
    gstin: `33ABCDE${String(suffix).slice(-4)}F1Z5`
  });
  assert.equal(regA.status, 201, JSON.stringify(regA.json));
  assert.equal(regA.json.status, 'PENDING_VERIFICATION');
  assert.ok(regA.json.organization?.id);
  assert.equal(regA.json.organization.portalType, 'SELLER');
  assert.equal(regA.json.membership?.isOwner, true);
  pass('Business registration creates User + Organization + HQ Branch + Owner Membership');

  // 7. Resend email verification + Email verification token flow
  const resendRes = await orgA.req('POST', '/api/auth/resend-verification');
  assert.equal(resendRes.status, 200);
  assert.ok(resendRes.json._devEmailVerifyToken);
  const verifyRes = await orgA.req('POST', '/api/auth/verify-email', { token: resendRes.json._devEmailVerifyToken });
  assert.equal(verifyRes.status, 200);
  const meAfterVerify = await orgA.req('GET', '/api/me');
  assert.equal(meAfterVerify.json.emailVerified, true);
  assert.equal(meAfterVerify.json.status, 'PENDING_VERIFICATION'); // still pending admin KYC!
  assert.equal(meAfterVerify.json.businessProfile.verification.status, 'PENDING_VERIFICATION');
  pass('Resend + Email verification succeeds while keeping business verification status distinct');

  // 8. Pending account blocked from active-only routes (KAEN, Worker Invite)
  const pendingKaen = await orgA.req('POST', '/api/kaen/negotiate', {
    round: 1, maxRounds: 5, buyerOffer: 250, sellerAsk: 300, sellerFloorPrice: 270, quantity: 100
  });
  assert.equal(pendingKaen.status, 403);
  pass('Pending business account blocked from active-only endpoints (403)');

  // 9. Document upload: reject invalid file type (.exe), accept valid PDF
  const badFd = new FormData();
  badFd.append('file', new Blob(['MZfake'], { type: 'application/x-msdownload' }), 'malware.exe');
  badFd.append('docType', 'GST_CERTIFICATE');
  const badUpload = await orgA.req('POST', '/api/org/documents', null, { rawFormData: badFd });
  assert.equal(badUpload.status, 400);

  const goodFd = new FormData();
  goodFd.append('file', new Blob(['%PDF-1.4 test doc'], { type: 'application/pdf' }), 'gst-cert.pdf');
  goodFd.append('docType', 'GST_CERTIFICATE');
  const goodUpload = await orgA.req('POST', '/api/org/documents', null, { rawFormData: goodFd });
  assert.equal(goodUpload.status, 201, JSON.stringify(goodUpload.json));
  const docAId = goodUpload.json.document.id;
  pass('Secure upload rejects .exe (400) and stores valid PDF (201)');

  // 10. Super Admin login + Business Verification (request-docs -> approve) + Audit log check
  const adminLogin = await admin.req('POST', '/api/auth/login', {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@sahayak.in',
    password: process.env.TEST_ADMIN_PASSWORD || 'ChangeMe123!'
  });
  assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.json));
  const vq = await admin.req('GET', '/api/admin/verifications');
  assert.equal(vq.status, 200);
  const vItem = vq.json.find((v) => v.business?.user?.email === emailA);
  assert.ok(vItem, 'Org A must appear in admin verification queue');

  const reqDocs = await admin.req('POST', `/api/admin/verifications/${vItem.id}/request-docs`, { notes: 'Please confirm GST cert' });
  assert.equal(reqDocs.status, 200);
  const meNeedsInfo = await orgA.req('GET', '/api/me');
  assert.equal(meNeedsInfo.json.status, 'NEEDS_INFO');
  assert.equal(meNeedsInfo.json.businessProfile.verification.reviewerNotes, 'Please confirm GST cert');

  const approveRes = await admin.req('POST', `/api/admin/verifications/${vItem.id}/approve`, { notes: 'Verified cleanly' });
  assert.equal(approveRes.status, 200);
  const allVer = await admin.req('GET', '/api/admin/verifications?status=ALL');
  assert.equal(allVer.status, 200);
  assert.ok(allVer.json.some((v) => v.id === vItem.id && v.status === 'ACTIVE'));
  pass('Super Admin verification workflow (request-docs → reviewerNotes visible in /api/me → approve) works');

  // 10b. Admin search/filter + User login history
  const searchAdmin = await admin.req('GET', `/api/admin/users?search=${encodeURIComponent(emailA)}&role=MANUFACTURER`);
  assert.equal(searchAdmin.status, 200);
  assert.equal(searchAdmin.json.users.length, 1);
  const uHist = await admin.req('GET', `/api/admin/users/${regA.json.id}/login-history`);
  assert.equal(uHist.status, 200);
  assert.ok(uHist.json.history.length >= 1);
  pass('Admin user search/filter and security login history endpoints return live records');

  // 11. Active Org A can now call KAEN negotiation engine
  const kaenRes = await orgA.req('POST', '/api/kaen/negotiate', {
    round: 2, maxRounds: 5, buyerOffer: 265, sellerAsk: 300, sellerFloorPrice: 270, quantity: 500
  });
  assert.equal(kaenRes.status, 200);
  assert.equal(kaenRes.json.status, 'COUNTER_OFFER');
  pass('Approved business can execute preserved KAEN negotiation engine (200)');

  // 12. Owner A invites a Worker — privilege escalation via permissions=['*'] must be rejected (400)
  const workerEmail = `worker_a_${suffix}@test.in`;
  createdEmails.push(workerEmail);
  const escInvite = await orgA.req('POST', '/api/org/invitations', {
    email: workerEmail, fullName: 'Escalation Test', workerRole: 'WAREHOUSE_STAFF',
    permissions: ['*']
  });
  assert.equal(escInvite.status, 400);

  const invRes = await orgA.req('POST', '/api/org/invitations', {
    email: workerEmail, fullName: 'Ramesh Warehouse', workerRole: 'WAREHOUSE_STAFF',
    employeeId: 'EMP-101', department: 'Warehouse', designation: 'Store Keeper'
  });
  assert.equal(invRes.status, 201, JSON.stringify(invRes.json));
  const inviteCode = invRes.json.inviteCode;

  // Invalid invite code rejected
  const badJoin = await workerA.req('POST', '/api/auth/worker/join', {
    inviteCode: 'SHK-INVALID000', email: workerEmail, password: 'WorkerPass123!'
  });
  assert.equal(badJoin.status, 400);

  // Valid invite code joins Org A as WORKER
  const goodJoin = await workerA.req('POST', '/api/auth/worker/join', {
    inviteCode, email: workerEmail, password: 'WorkerPass123!'
  });
  assert.equal(goodJoin.status, 201, JSON.stringify(goodJoin.json));
  assert.equal(goodJoin.json.role, 'WORKER');
  assert.equal(goodJoin.json.organization.id, regA.json.organization.id);

  // Worker dedicated login succeeds + member privilege escalation rejected (400)
  const workerLoginCheck = await workerA.req('POST', '/api/auth/worker/login', {
    email: workerEmail, password: 'WorkerPass123!'
  });
  assert.equal(workerLoginCheck.status, 200);
  const escPatch = await orgA.req('PATCH', `/api/org/members/${goodJoin.json.membership.id}`, {
    permissions: ['*', 'APPROVE_KYC']
  });
  assert.equal(escPatch.status, 400);
  pass('Worker invite-only join, dedicated worker login, and permission privilege-escalation blocks work');

  // 13. Security Isolation Tests for Worker
  // Worker blocked from Business Login endpoint
  const wBizLogin = await anon.req('POST', '/api/auth/login', { email: workerEmail, password: 'WorkerPass123!' });
  assert.equal(wBizLogin.status, 403);
  // Worker blocked from Admin endpoints
  const wAdmin = await workerA.req('GET', '/api/admin/stats');
  assert.equal(wAdmin.status, 403);
  // Warehouse worker blocked from inviting other workers
  const wInvite = await workerA.req('POST', '/api/org/invitations', {
    email: `x_${suffix}@test.in`, fullName: 'X', workerRole: 'DRIVER'
  });
  assert.equal(wInvite.status, 403);
  // Warehouse worker blocked from confidential org verification documents
  const wDoc = await workerA.req('GET', `/api/org/documents/${docAId}/download`);
  assert.equal(wDoc.status, 403);
  pass('RBAC blocks Worker from Business login, Admin APIs, Invite API, and Confidential Org Docs (403)');

  // 14. Cross-Organization Isolation Test (Org B cannot access Org A document)
  const emailB = `retail_b_${suffix}@test.in`;
  createdEmails.push(emailB);
  const regB = await orgB.req('POST', '/api/auth/register', {
    fullName: 'Owner B', email: emailB, password: 'Password123!',
    businessType: 'RETAILER', businessName: `Org B Retail ${suffix}`, category: 'Textiles & Garments',
    address: 'Main Road 4', city: 'Vijayawada', state: 'AP', pinCode: '520001'
  });
  assert.equal(regB.status, 201);
  const crossOrgDoc = await orgB.req('GET', `/api/org/documents/${docAId}/download`);
  assert.equal(crossOrgDoc.status, 403);
  pass('Cross-organization isolation blocks Org B from reading Org A documents (403)');

  // 15. Forgot + Reset Password flow (revokes old sessions)
  const forgot = await anon.req('POST', '/api/auth/forgot-password', { email: emailB });
  assert.equal(forgot.status, 200);
  const reset = await anon.req('POST', '/api/auth/reset-password', {
    token: forgot.json._devResetToken, password: 'NewPassword456!'
  });
  assert.equal(reset.status, 200);
  // Old Org B session must now be revoked (401)
  const oldSessionMe = await orgB.req('GET', '/api/me');
  assert.equal(oldSessionMe.status, 401);
  pass('Password reset succeeds and revokes all previous sessions (401)');

  // 16. Live Gemini AI check (diagnostic — checks real backend response with current .env key)
  const aiRes = await admin.req('POST', '/api/ai/chat', { prompt: 'Reply with OK in one word.' });
  const aiUsage = await admin.req('GET', '/api/admin/ai-usage');
  assert.equal(aiUsage.status, 200);
  console.log(`  ℹ️  Live Gemini API diagnostic: HTTP ${aiRes.status} — ${aiRes.status === 200 ? 'SUCCESS (' + (aiRes.json?.usage?.totalTokens || 0) + ' tokens)' : (aiRes.json?.error || aiRes.text).slice(0, 160)}`);

  console.log(`\n🎉 Phase B Test Suite: ${results.length}/${results.length} security & auth assertions PASSED.\n`);
}

async function cleanup() {
  // Remove only synthetic test users/orgs created by this test run
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
    console.error('\n❌ Phase B Test Failed:', err);
    process.exitCode = 1;
  })
  .finally(cleanup);
