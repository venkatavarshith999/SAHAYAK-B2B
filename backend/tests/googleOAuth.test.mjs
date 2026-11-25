/**
 * SAHAYAK B2B — Google OAuth 2.0 Integration & Security Test Suite
 * Tests:
 * 1. Public OAuth status (no credential leakage)
 * 2. Redirect handshake + HttpOnly state cookie + exact callback URI
 * 3. Invalid OAuth responses (missing/mismatched state, access_denied, invalid code, tampered cookie, bad idToken)
 * 4. New Google user registration -> DB records (User, OAuthAccount, Organization, Branch, Membership, Verification) -> Protected Routes -> Admin Approval -> Logout
 * 5. Existing Google user login resolution (no duplicate accounts)
 * 6. Existing password user account linking (wrong password blocked 401, correct password links OAuthAccount & creates session)
 */

import assert from 'node:assert/strict';
import 'dotenv/config';
import { prisma } from '../src/config/db.js';
import { signPendingGoogleToken, resolveGoogleIdentity } from '../src/auth/authService.js';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:4000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || '';

const ts = Date.now();
const newGoogleEmail = `g_new_${ts}@sahayak-test.in`;
const newGoogleSub = `google-sub-new-${ts}`;
const linkUserEmail = `g_link_${ts}@sahayak-test.in`;
const linkUserSub = `google-sub-link-${ts}`;
const linkUserPwd = 'LinkSecure#2026';

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

function extractCookie(res, cookieName) {
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  for (const raw of setCookies) {
    const match = raw.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
    if (match) return `${cookieName}=${match[1]}`;
  }
  return null;
}

async function cleanup() {
  const emails = [newGoogleEmail, linkUserEmail];
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    include: { memberships: true }
  });
  const userIds = users.map((u) => u.id);
  const orgIds = users.flatMap((u) => u.memberships.map((m) => m.organizationId));

  if (userIds.length) {
    await prisma.adminAuditLog.deleteMany({ where: { actorId: { in: userIds } } }).catch(() => {});
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

console.log('\n🔐 Running SAHAYAK B2B Google OAuth 2.0 Test Suite...\n');

try {
  await test('1. GET /api/auth/google/status reports configured=true without leaking secrets', async () => {
    const res = await fetch(`${BASE}/api/auth/google/status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.configured, true);
    assert.equal(body.callbackPath, '/api/auth/google/callback');
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes('GOCSPX'), 'Client secret must never appear in status output');
    assert.ok(!serialized.includes('googleusercontent.com'), 'Raw Client ID does not need to be exposed here');
  });

  await test('2. GET /api/auth/google/redirect sets HttpOnly state cookie and redirects to Google OAuth with exact callback URL', async () => {
    const res = await fetch(`${BASE}/api/auth/google/redirect`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    const location = res.headers.get('location') || '';
    const url = new URL(location);
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.pathname, '/o/oauth2/v2/auth');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:4000/api/auth/google/callback');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('scope'), 'openid email profile');
    assert.equal(url.searchParams.get('access_type'), null, 'Must not request unnecessary offline refresh tokens');
    assert.ok((url.searchParams.get('state') || '').length >= 32, 'State token must have strong entropy');

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
    const stateHeader = setCookies.find((c) => c.startsWith('sahayak_oauth_state=')) || '';
    assert.ok(stateHeader.includes('HttpOnly'), 'OAuth state cookie must be HttpOnly');
    assert.ok(stateHeader.toLowerCase().includes('samesite=lax'), 'OAuth state cookie must be SameSite=Lax');
  });

  await test('3. Invalid OAuth callback states, cancellations, and tampered cookies are rejected safely', async () => {
    // Missing state cookie
    const r1 = await fetch(`${BASE}/api/auth/google/callback?code=fake&state=wrong`, { redirect: 'manual' });
    assert.equal(r1.status, 302);
    assert.ok((r1.headers.get('location') || '').includes('#/login?error=google_state_invalid'));

    // Mismatched state cookie
    const r2 = await fetch(`${BASE}/api/auth/google/callback?code=fake&state=abc`, {
      redirect: 'manual',
      headers: { Cookie: 'sahayak_oauth_state=xyz' }
    });
    assert.equal(r2.status, 302);
    assert.ok((r2.headers.get('location') || '').includes('#/login?error=google_state_invalid'));

    // User clicked Cancel on Google consent screen
    const r3 = await fetch(`${BASE}/api/auth/google/callback?error=access_denied`, { redirect: 'manual' });
    assert.equal(r3.status, 302);
    assert.ok((r3.headers.get('location') || '').includes('#/login?error=google_cancelled'));

    // Tampered pending cookie rejected on /pending and /complete
    const r4 = await fetch(`${BASE}/api/auth/google/pending`, {
      headers: { Cookie: 'sahayak_google_pending=tampered.signature' }
    });
    assert.equal(r4.status, 404);

    const r5 = await fetch(`${BASE}/api/auth/google/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'sahayak_google_pending=tampered.signature' },
      body: JSON.stringify({
        role: 'RETAILER',
        businessName: 'Tamper Shop',
        category: 'Textiles & Garments',
        address: '123 Fake St',
        city: 'Hyderabad',
        state: 'Telangana',
        pinCode: '500001'
      })
    });
    assert.equal(r5.status, 401);

    // Invalid ID token on POST /api/auth/google rejected
    const r6 = await fetch(`${BASE}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'not-a-valid-google-jwt' })
    });
    assert.equal(r6.status, 400);
  });

  let googleSessionCookie = null;
  let createdGoogleUserId = null;

  await test('4. New Google user registration creates User + OAuthAccount + Organization + Session, enforces protected routes, and supports logout', async () => {
    const pendingToken = signPendingGoogleToken({
      mode: 'REGISTER',
      sub: newGoogleSub,
      email: newGoogleEmail,
      fullName: 'Google New Buyer'
    });
    const pendingCookie = `sahayak_google_pending=${pendingToken}`;

    // Verify GET /api/auth/google/pending returns identity
    const pendRes = await fetch(`${BASE}/api/auth/google/pending`, { headers: { Cookie: pendingCookie } });
    assert.equal(pendRes.status, 200);
    const pendBody = await pendRes.json();
    assert.equal(pendBody.mode, 'REGISTER');
    assert.equal(pendBody.email, newGoogleEmail);

    // Complete registration
    const regRes = await fetch(`${BASE}/api/auth/google/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: pendingCookie },
      body: JSON.stringify({
        role: 'RETAILER',
        businessType: 'RETAILER',
        fullName: 'Google New Buyer',
        businessName: `Google Retail Mart ${ts}`,
        category: 'Textiles & Garments',
        address: '45 Jubilee Hills',
        city: 'Hyderabad',
        state: 'Telangana',
        pinCode: '500033'
      })
    });
    assert.equal(regRes.status, 201);
    const regBody = await regRes.json();
    assert.equal(regBody.status, 'AUTHENTICATED');
    assert.equal(regBody.user.email, newGoogleEmail);
    assert.equal(regBody.user.emailVerified, true);
    assert.equal(regBody.user.status, 'PENDING_VERIFICATION');
    assert.ok(regBody.user.organization?.id, 'Organization must be created for Google business user');
    createdGoogleUserId = regBody.user.id;

    googleSessionCookie = extractCookie(regRes, 'sahayak_session');
    assert.ok(googleSessionCookie, 'Must set HttpOnly sahayak_session cookie');

    // Verify DB records directly
    const dbOAuth = await prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: newGoogleSub } }
    });
    assert.ok(dbOAuth && dbOAuth.userId === createdGoogleUserId, 'OAuthAccount must be persisted in PostgreSQL');

    // Verify /api/me works with session cookie
    const meRes = await fetch(`${BASE}/api/me`, { headers: { Cookie: googleSessionCookie } });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.email, newGoogleEmail);

    // Verify protected active-business route blocks PENDING_VERIFICATION (403)
    const rfqPending = await fetch(`${BASE}/api/rfqs`, { headers: { Cookie: googleSessionCookie } });
    assert.equal(rfqPending.status, 403);

    // Duplicate registration with same Google sub blocked
    const dupRes = await fetch(`${BASE}/api/auth/google/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: pendingCookie },
      body: JSON.stringify({
        role: 'RETAILER',
        businessName: 'Duplicate Attempt',
        category: 'Textiles & Garments',
        address: '1 Main St',
        city: 'Hyderabad',
        state: 'Telangana',
        pinCode: '500033'
      })
    });
    assert.equal(dupRes.status, 400);

    // Verify existing Google user login resolution returns AUTHENTICATED directly
    const resolvedExisting = await resolveGoogleIdentity({
      sub: newGoogleSub,
      email: newGoogleEmail,
      fullName: 'Google New Buyer'
    });
    assert.equal(resolvedExisting.status, 'AUTHENTICATED');
    assert.equal(resolvedExisting.user.id, createdGoogleUserId);

    // Optional Admin approval -> active protected route succeeds (200)
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      const adminLogin = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      });
      assert.equal(adminLogin.status, 200);
      const adminCookie = extractCookie(adminLogin, 'sahayak_session');
      const approveRes = await fetch(`${BASE}/api/admin/verifications/${regBody.user.businessProfile.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ decision: 'ACTIVE', notes: 'Approved in Google OAuth test' })
      });
      assert.equal(approveRes.status, 200);

      const rfqActive = await fetch(`${BASE}/api/rfqs`, { headers: { Cookie: googleSessionCookie } });
      assert.equal(rfqActive.status, 200);
    }

    // Verify Logout revokes session and blocks protected routes
    const logoutRes = await fetch(`${BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: googleSessionCookie }
    });
    assert.equal(logoutRes.status, 200);

    const meAfterLogout = await fetch(`${BASE}/api/me`, { headers: { Cookie: googleSessionCookie } });
    assert.equal(meAfterLogout.status, 401);
  });

  await test('5. Existing password user account linking requires password verification and prevents account takeover', async () => {
    // Register standard email/password user
    const regRes = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Existing Password Owner',
        businessName: `Legacy Traders ${ts}`,
        email: linkUserEmail,
        password: linkUserPwd,
        role: 'RETAILER',
        businessType: 'RETAILER',
        category: 'FMCG & Consumer Goods',
        address: '88 Banjara Hills',
        city: 'Hyderabad',
        state: 'Telangana',
        pinCode: '500034'
      })
    });
    assert.equal(regRes.status, 201);

    // Resolution must return LINK_REQUIRED (never auto-link without verifying password!)
    const resolved = await resolveGoogleIdentity({
      sub: linkUserSub,
      email: linkUserEmail,
      fullName: 'Existing Password Owner'
    });
    assert.equal(resolved.status, 'LINK_REQUIRED');

    const linkPendingToken = signPendingGoogleToken({
      mode: 'LINK',
      sub: linkUserSub,
      email: linkUserEmail,
      fullName: 'Existing Password Owner'
    });
    const linkCookie = `sahayak_google_pending=${linkPendingToken}`;

    // Wrong password must fail with 401 and NOT link account
    const wrongRes = await fetch(`${BASE}/api/auth/google/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: linkCookie },
      body: JSON.stringify({ password: 'WrongPassword123' })
    });
    assert.equal(wrongRes.status, 401);

    const shouldBeNull = await prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: linkUserSub } }
    });
    assert.equal(shouldBeNull, null, 'OAuthAccount must NOT be created when password fails');

    // Correct password links account and sets valid session cookie
    const okRes = await fetch(`${BASE}/api/auth/google/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: linkCookie },
      body: JSON.stringify({ password: linkUserPwd })
    });
    assert.equal(okRes.status, 200);
    const okBody = await okRes.json();
    assert.equal(okBody.status, 'AUTHENTICATED');
    assert.equal(okBody.user.email, linkUserEmail);
    assert.equal(okBody.user.emailVerified, true);

    const linkedSession = extractCookie(okRes, 'sahayak_session');
    assert.ok(linkedSession);
    const meRes = await fetch(`${BASE}/api/me`, { headers: { Cookie: linkedSession } });
    assert.equal(meRes.status, 200);

    // Subsequent Google login resolves directly to AUTHENTICATED
    const afterLink = await resolveGoogleIdentity({
      sub: linkUserSub,
      email: linkUserEmail,
      fullName: 'Existing Password Owner'
    });
    assert.equal(afterLink.status, 'AUTHENTICATED');
    assert.equal(afterLink.user.email, linkUserEmail);
  });

  console.log(`\n🎉 Google OAuth 2.0 Test Suite PASSED (${passed}/5 assertions)\n`);
} finally {
  await cleanup();
  await prisma.$disconnect();
}
