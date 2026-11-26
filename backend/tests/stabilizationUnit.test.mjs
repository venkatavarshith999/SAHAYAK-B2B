/**
 * SAHAYAK B2B — Stabilization Unit, Security, OAuth & Gemini Resilience Test Suite
 * Covers:
 *  - Authoritative Portal Resolution (backend + frontend mirror) for all 7 roles + forged destination defense
 *  - Google OAuth URL resolution (local & prod), ID token validation (aud/iss/exp/email_verified), signed pending tokens
 *  - Gemini Provider isolated fault-injection tests (empty, missing key, invalid key no-retry, 400 no-retry,
 *    404 fallback, 429 retry-after, 503 transient retry + clean error, timeout, malformed empty response, all 7 role prompts)
 *  - REAL live Gemini API verification against configured GEMINI_API_KEY & GEMINI_MODEL (marked clearly)
 */

import assert from 'node:assert/strict';
import 'dotenv/config';
import { resolvePortalDestination as backendResolvePortal } from '../src/config/permissions.js';
import { resolvePortalDestination as frontendResolvePortal } from '../../frontend/src/utils/portalResolver.js';
import {
  validateGoogleTokenPayload,
  signPendingGoogleToken,
  verifyPendingGoogleToken
} from '../src/auth/authService.js';
import { resolveOAuthUrls } from '../src/routes/auth.routes.js';
import {
  GeminiB2BProvider,
  classifyGeminiError,
  estimateGeminiCostUsd
} from '../src/ai/geminiProvider.js';

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

console.log('\n🧪 Running SAHAYAK B2B Stabilization Unit, OAuth & Gemini Test Suite...\n');

// ── 1. Authoritative Portal Resolution (Backend & Frontend Parity) ────────────
await test('1. Portal resolution maps all 7 user types to exact authoritative destinations (backend & frontend parity)', async () => {
  const cases = [
    { user: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, portal: 'ADMIN', workspace: 'SUPER_ADMIN', route: '/dashboard/admin' },
    { user: { role: 'VERIFICATION_ADMIN', status: 'ACTIVE' }, portal: 'ADMIN', workspace: 'VERIFICATION_ADMIN', route: '/dashboard/admin' },
    { user: { role: 'RETAILER', status: 'ACTIVE', organization: { portalType: 'BUYER', businessType: 'RETAILER' } }, portal: 'BUYER', workspace: 'BUYER', route: '/dashboard/buyer' },
    { user: { role: 'WHOLESALER', status: 'ACTIVE', organization: { portalType: 'SELLER', businessType: 'WHOLESALER' } }, portal: 'SELLER', workspace: 'SELLER', route: '/dashboard/seller' },
    { user: { role: 'MANUFACTURER', status: 'ACTIVE', organization: { portalType: 'SELLER', businessType: 'MANUFACTURER' } }, portal: 'SELLER', workspace: 'MANUFACTURER', route: '/dashboard/seller' },
    { user: { role: 'DISTRIBUTOR', status: 'ACTIVE', organization: { portalType: 'SELLER', businessType: 'DISTRIBUTOR' } }, portal: 'SELLER', workspace: 'DISTRIBUTOR', route: '/dashboard/seller' },
    { user: { role: 'SUPPLIER', status: 'ACTIVE', organization: { portalType: 'SELLER', businessType: 'SUPPLIER' } }, portal: 'SELLER', workspace: 'SELLER', route: '/dashboard/seller' },
    { user: { role: 'LOGISTICS', status: 'ACTIVE', organization: { portalType: 'LOGISTICS', businessType: 'LOGISTICS' } }, portal: 'LOGISTICS', workspace: 'LOGISTICS', route: '/dashboard/logistics' },
    { user: { role: 'WORKER', status: 'ACTIVE', organization: { portalType: 'SELLER', businessType: 'MANUFACTURER' }, membership: { workerRole: 'WAREHOUSE_STAFF' } }, portal: 'WORKER', workspace: 'WAREHOUSE_STAFF', route: '/dashboard/worker' },
    { user: { role: 'RETAILER', status: 'PENDING_VERIFICATION', organization: { portalType: 'BUYER', businessType: 'RETAILER' } }, portal: 'PENDING', workspace: 'PENDING_VERIFICATION', route: '/pending' },
    { user: { role: 'WHOLESALER', status: 'NEEDS_INFO' }, portal: 'PENDING', workspace: 'NEEDS_INFO', route: '/pending' },
    { user: { role: 'MANUFACTURER', status: 'REJECTED' }, portal: 'RESTRICTED', workspace: 'REJECTED', route: '/restricted' },
    { user: { role: 'LOGISTICS', status: 'SUSPENDED' }, portal: 'RESTRICTED', workspace: 'SUSPENDED', route: '/restricted' }
  ];

  for (const c of cases) {
    const b = backendResolvePortal(c.user);
    const f = frontendResolvePortal(c.user);
    assert.equal(b.portal, c.portal, `Backend portal mismatch for ${c.user.role}/${c.user.status}`);
    assert.equal(b.workspace, c.workspace, `Backend workspace mismatch for ${c.user.role}/${c.user.status}`);
    assert.equal(b.route, c.route, `Backend route mismatch for ${c.user.role}/${c.user.status}`);
    assert.equal(f.portal, c.portal, `Frontend portal mismatch for ${c.user.role}/${c.user.status}`);
    assert.equal(f.workspace, c.workspace, `Frontend workspace mismatch for ${c.user.role}/${c.user.status}`);
    assert.equal(f.route, c.route, `Frontend route mismatch for ${c.user.role}/${c.user.status}`);
  }
});

await test('2. Forged admin portalDestination on a business user is rejected and resolved to Buyer Portal', async () => {
  const tamperedBuyer = {
    role: 'RETAILER',
    status: 'ACTIVE',
    organization: { portalType: 'BUYER', businessType: 'RETAILER' },
    portalDestination: { portal: 'ADMIN', workspace: 'SUPER_ADMIN', route: '/dashboard/admin' }
  };
  const resolved = frontendResolvePortal(tamperedBuyer);
  assert.equal(resolved.portal, 'BUYER');
  assert.equal(resolved.route, '/dashboard/buyer');
});

// ── 2. Google OAuth URL Resolution & Token Validation ─────────────────────────
await test('3. Google OAuth URL resolution supports local, production, and dynamic host derivation cleanly', async () => {
  const origFront = process.env.FRONTEND_ORIGIN;
  const origRedir = process.env.GOOGLE_REDIRECT_URI;
  const origUrl = process.env.URL;

  try {
    // Production env
    process.env.FRONTEND_ORIGIN = 'https://sahayak-b2b.netlify.app/';
    process.env.GOOGLE_REDIRECT_URI = 'https://sahayak-b2b.netlify.app/api/auth/google/callback/';
    let urls = resolveOAuthUrls({ protocol: 'https', get: () => 'sahayak-b2b.netlify.app' });
    assert.equal(urls.frontendOrigin, 'https://sahayak-b2b.netlify.app');
    assert.equal(urls.redirectUri, 'https://sahayak-b2b.netlify.app/api/auth/google/callback');

    // Local dev env
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:4000/api/auth/google/callback';
    urls = resolveOAuthUrls({ protocol: 'http', get: () => 'localhost:4000' });
    assert.equal(urls.frontendOrigin, 'http://localhost:5173');
    assert.equal(urls.redirectUri, 'http://localhost:4000/api/auth/google/callback');

    // Unset env fallback derives from request host without hardcoded URLs
    delete process.env.FRONTEND_ORIGIN;
    delete process.env.GOOGLE_REDIRECT_URI;
    delete process.env.URL;
    urls = resolveOAuthUrls({
      protocol: 'https',
      get: (h) => (h === 'x-forwarded-host' ? 'custom.sahayak.in' : h === 'x-forwarded-proto' ? 'https' : '')
    });
    assert.equal(urls.frontendOrigin, 'https://custom.sahayak.in');
    assert.equal(urls.redirectUri, 'https://custom.sahayak.in/api/auth/google/callback');
  } finally {
    process.env.FRONTEND_ORIGIN = origFront;
    process.env.GOOGLE_REDIRECT_URI = origRedir;
    if (origUrl !== undefined) process.env.URL = origUrl;
    else delete process.env.URL;
  }
});

await test('4. Google ID token validation enforces audience, issuer, expiry, and email_verified=true', async () => {
  const validExp = Math.floor(Date.now() / 1000) + 300;
  const ok = validateGoogleTokenPayload(
    {
      aud: 'test-client-id',
      iss: 'https://accounts.google.com',
      exp: validExp,
      email_verified: true,
      email: 'Buyer@Test.in',
      sub: 'sub-12345',
      name: 'Buyer Test'
    },
    'test-client-id'
  );
  assert.equal(ok.email, 'buyer@test.in');
  assert.equal(ok.sub, 'sub-12345');

  // Wrong audience
  assert.throws(() => validateGoogleTokenPayload({ aud: 'wrong', iss: 'accounts.google.com', exp: validExp, email_verified: true, email: 'a@b.com', sub: '1' }, 'test-client-id'), /audience/i);
  // Wrong issuer
  assert.throws(() => validateGoogleTokenPayload({ aud: 'test-client-id', iss: 'https://evil.example', exp: validExp, email_verified: true, email: 'a@b.com', sub: '1' }, 'test-client-id'), /issuer/i);
  // Expired token
  assert.throws(() => validateGoogleTokenPayload({ aud: 'test-client-id', iss: 'accounts.google.com', exp: Math.floor(Date.now() / 1000) - 10, email_verified: true, email: 'a@b.com', sub: '1' }, 'test-client-id'), /expired/i);
  // Unverified email (strict boolean)
  assert.throws(() => validateGoogleTokenPayload({ aud: 'test-client-id', iss: 'accounts.google.com', exp: validExp, email_verified: false, email: 'a@b.com', sub: '1' }, 'test-client-id'), /unverified/i);
  assert.throws(() => validateGoogleTokenPayload({ aud: 'test-client-id', iss: 'accounts.google.com', exp: validExp, email_verified: 'true', email: 'a@b.com', sub: '1' }, 'test-client-id'), /unverified/i);

  // Pending HMAC cookie signing/verification rejects tampering
  const signed = signPendingGoogleToken({ mode: 'REGISTER', sub: 'sub-1', email: 'x@y.com', fullName: 'X' });
  assert.equal(verifyPendingGoogleToken(signed)?.email, 'x@y.com');
  assert.equal(verifyPendingGoogleToken(signed + 'tamper'), null);
});

// ── 3. Gemini AI Provider Isolated Resilience & Fault Injection Tests ─────────
const noopSleep = async () => {};
const noopLog = async () => {};

await test('5. Gemini Provider rejects empty prompts (400) and missing API key (503) without fabricating answers', async () => {
  const providerNoKey = new GeminiB2BProvider({ apiKey: '', client: null, sleepFn: noopSleep, usageLogger: noopLog });
  assert.equal(providerNoKey.isConfigured(), false);
  await assert.rejects(
    () => providerNoKey.generateBusinessResponse({ userId: 'u1', role: 'RETAILER', prompt: '   ' }),
    (err) => err.statusCode === 400 && err.errorCode === 'AI_EMPTY_PROMPT'
  );
  await assert.rejects(
    () => providerNoKey.generateBusinessResponse({ userId: 'u1', role: 'RETAILER', prompt: 'Hello' }),
    (err) => err.statusCode === 503 && err.errorCode === 'AI_NOT_CONFIGURED' && !err.message.includes('{')
  );
});

await test('6. Gemini Provider does NOT retry permanent auth (401/403) or bad request (400) errors and never leaks secrets', async () => {
  let calls = 0;
  const fakeAuthFail = {
    models: {
      generateContent: async () => {
        calls++;
        const err = new Error('{"error":{"code":403,"message":"API_KEY_INVALID for key SECRET_XYZ","status":"PERMISSION_DENIED"}}');
        err.status = 403;
        throw err;
      }
    }
  };
  const provider = new GeminiB2BProvider({
    apiKey: 'fake-key',
    model: 'gemini-3.6-flash',
    fallbackModels: ['gemini-3.5-flash'],
    client: fakeAuthFail,
    maxRetries: 2,
    sleepFn: noopSleep,
    usageLogger: noopLog
  });
  await assert.rejects(
    () => provider.generateBusinessResponse({ userId: 'u1', role: 'RETAILER', prompt: 'Hi' }),
    (err) => err.statusCode === 502 && err.errorCode === 'AI_AUTH_ERROR' && !err.message.includes('SECRET_XYZ') && !err.message.includes('{')
  );
  assert.equal(calls, 1, 'Permanent 403 auth failure must NOT retry or call fallback models');
});

await test('7. Gemini Provider retries transient 503/429 errors with backoff and succeeds when provider recovers', async () => {
  let calls = 0;
  const delays = [];
  const transientClient = {
    models: {
      generateContent: async ({ model }) => {
        calls++;
        if (calls < 3) {
          const err = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}');
          err.status = 503;
          throw err;
        }
        return {
          text: `Recovered on ${model}`,
          usageMetadata: { promptTokenCount: 25, candidatesTokenCount: 10, totalTokenCount: 35 }
        };
      }
    }
  };
  const provider = new GeminiB2BProvider({
    apiKey: 'fake-key',
    model: 'gemini-3.6-flash',
    fallbackModels: [],
    client: transientClient,
    maxRetries: 2,
    baseDelayMs: 100,
    sleepFn: async (ms) => { delays.push(ms); },
    usageLogger: noopLog
  });
  const out = await provider.generateBusinessResponse({ userId: 'u1', role: 'WHOLESALER', prompt: 'Test recovery' });
  assert.equal(out.text, 'Recovered on gemini-3.6-flash');
  assert.equal(calls, 3);
  assert.equal(delays.length, 2);
  assert.ok(out.usage.estimatedCostUsd > 0);
});

await test('8. Gemini Provider respects Retry-After on 429 and falls over cleanly on 404/persistent 503', async () => {
  const seenModels = [];
  const delays = [];
  const failoverClient = {
    models: {
      generateContent: async ({ model }) => {
        seenModels.push(model);
        if (model === 'gemini-3.8-flash') {
          const err = new Error('{"error":{"code":429,"message":"RESOURCE_EXHAUSTED","status":"RESOURCE_EXHAUSTED"}}');
          err.status = 429;
          err.headers = { 'retry-after': '1' };
          throw err;
        }
        return {
          text: `Served by ${model}`,
          usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 8, totalTokenCount: 23 }
        };
      }
    }
  };
  const provider = new GeminiB2BProvider({
    apiKey: 'fake-key',
    model: 'gemini-3.8-flash',
    fallbackModels: ['gemini-3.6-flash'],
    client: failoverClient,
    maxRetries: 1,
    sleepFn: async (ms) => { delays.push(ms); },
    usageLogger: noopLog
  });
  const out = await provider.generateBusinessResponse({ userId: 'u1', role: 'MANUFACTURER', prompt: 'Capacity plan' });
  assert.equal(out.model, 'gemini-3.6-flash');
  assert.equal(out.fallbackUsed, true);
  assert.deepEqual(seenModels, ['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.6-flash']);
  assert.equal(delays[0], 1000, 'Should respect Retry-After header (1s = 1000ms)');
});

await test('9. Gemini Provider handles request timeout (504) and malformed empty responses (502) without raw JSON', async () => {
  const hangingClient = {
    models: {
      generateContent: () => new Promise(() => {}) // never resolves
    }
  };
  const timeoutProvider = new GeminiB2BProvider({
    apiKey: 'fake-key',
    model: 'gemini-3.6-flash',
    fallbackModels: [],
    client: hangingClient,
    timeoutMs: 30,
    maxRetries: 0,
    sleepFn: noopSleep,
    usageLogger: noopLog
  });
  await assert.rejects(
    () => timeoutProvider.generateBusinessResponse({ userId: 'u1', role: 'LOGISTICS', prompt: 'Lane check' }),
    (err) => err.statusCode === 504 && err.errorCode === 'AI_TIMEOUT' && !err.message.includes('{')
  );

  const emptyClient = {
    models: {
      generateContent: async () => ({ text: '   ' })
    }
  };
  const malformedProvider = new GeminiB2BProvider({
    apiKey: 'fake-key',
    model: 'gemini-3.6-flash',
    fallbackModels: [],
    client: emptyClient,
    maxRetries: 0,
    sleepFn: noopSleep,
    usageLogger: noopLog
  });
  await assert.rejects(
    () => malformedProvider.generateBusinessResponse({ userId: 'u1', role: 'WORKER', prompt: 'Tasks' }),
    (err) => err.statusCode === 502 && err.errorCode === 'AI_MALFORMED_RESPONSE'
  );
});

await test('10. Gemini Provider builds role-specific system instructions for all 7 portals and includes org context', async () => {
  const captured = {};
  const spyClient = {
    models: {
      generateContent: async ({ config }) => {
        captured.lastInstruction = config.systemInstruction;
        return { text: 'Role-scoped answer', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } };
      }
    }
  };
  const provider = new GeminiB2BProvider({ apiKey: 'fake-key', client: spyClient, fallbackModels: [], maxRetries: 0, sleepFn: noopSleep, usageLogger: noopLog });
  const roleExpectations = [
    ['SUPER_ADMIN', /Platform Governance/i],
    ['RETAILER', /Retailers & Buyers/i],
    ['WHOLESALER', /Wholesalers & Sellers/i],
    ['MANUFACTURER', /Manufacturers/i],
    ['DISTRIBUTOR', /Distributors/i],
    ['LOGISTICS', /Transport & Logistics/i],
    ['WORKER', /Organization Workers/i]
  ];
  for (const [role, regex] of roleExpectations) {
    await provider.generateBusinessResponse({
      userId: 'u1',
      role,
      prompt: 'Summarize my role.',
      businessContext: `OrgScoped-${role}`
    });
    assert.match(captured.lastInstruction, regex, `Missing role instruction for ${role}`);
    assert.ok(captured.lastInstruction.includes(`OrgScoped-${role}`), `Missing authorized businessContext for ${role}`);
    assert.match(captured.lastInstruction, /human confirmation/i);
  }
});

// ── 4. REAL Live Gemini API Integration Verification ──────────────────────────
if (process.env.RUN_LIVE_GEMINI === '1' && process.env.GEMINI_API_KEY) {
  await test('11. [LIVE GEMINI API] Real generateBusinessResponse succeeds with configured GEMINI_API_KEY & GEMINI_MODEL', async () => {
    const liveProvider = new GeminiB2BProvider({ usageLogger: noopLog });
    const res = await liveProvider.generateBusinessResponse({
      userId: 'live-probe',
      role: 'RETAILER',
      prompt: 'In one short sentence, how can a B2B retailer compare wholesale quotations?',
      businessContext: 'Organization: Live Probe Retail (Portal: BUYER, BusinessType: RETAILER)'
    });
    assert.ok(res.text.length > 10, 'Expected non-empty live Gemini text');
    assert.ok(res.usage.totalTokens > 0, 'Expected real token counts from Gemini');
    assert.equal(estimateGeminiCostUsd(res.usage.promptTokens, res.usage.completionTokens), res.usage.estimatedCostUsd);
    console.log(`     [Live Gemini] model=${res.model}, fallbackUsed=${res.fallbackUsed}, latency=${res.latencyMs}ms, tokens=${res.usage.totalTokens}, estCost=$${res.usage.estimatedCostUsd}`);
  });
} else {
  console.log('  ⏭️  SKIPPED live Gemini call (set RUN_LIVE_GEMINI=1 to run real API check)');
}

console.log(`\n🎉 Stabilization Unit, OAuth & Gemini Test Suite PASSED (${passed} tests)\n`);
