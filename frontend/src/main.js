/**
 * SAHAYAK B2B — Application Bootstrap
 * Routes all 5 primary portals + dedicated Worker Access + Email Verification & Password Reset.
 */

import './styles/design-system.css';
import './styles/components.css';
import './styles/animations.css';

import { route, navigate, startRouter } from './router.js';
import {
  store,
  setState,
  restoreUser,
  persistUser,
  broadcastSessionIdentity,
  SESSION_OWNER_KEY,
  DEMO_USERS
} from './store.js';
import { api } from './api.js';
import { showToast } from './components/toast.js';
import {
  isAdminRole,
  resolvePortalDestination
} from './utils/portalResolver.js';

import renderWelcome from './pages/welcome.js';
import renderRoleSelect from './pages/role-select.js';
import renderLogin from './pages/login.js';
import renderRegister from './pages/register.js';
import renderPending from './pages/pending.js';
import renderForgotPw from './pages/forgot-password.js';
import renderResetPw from './pages/reset-password.js';
import renderVerifyEmail from './pages/verify-email.js';
import renderWorkerAccess from './pages/worker-login.js';

const dashboardModules = {};
async function getDashboardByPortal(portal) {
  const key = ['BUYER', 'SELLER', 'LOGISTICS', 'WORKER', 'ADMIN'].includes(portal) ? portal : null;
  if (!key) return null;
  if (!dashboardModules[key]) {
    switch (key) {
      case 'BUYER':
        dashboardModules[key] = (await import('./pages/dashboard/retailer.js')).default;
        break;
      case 'SELLER':
        dashboardModules[key] = (await import('./pages/dashboard/seller.js')).default;
        break;
      case 'LOGISTICS':
        dashboardModules[key] = (await import('./pages/dashboard/logistics.js')).default;
        break;
      case 'WORKER':
        dashboardModules[key] = (await import('./pages/dashboard/worker.js')).default;
        break;
      case 'ADMIN':
        dashboardModules[key] = (await import('./pages/dashboard/admin.js')).default;
        break;
      default:
        return null;
    }
  }
  return dashboardModules[key];
}

function getApp() {
  return document.getElementById('app');
}

function renderPage(html) {
  const app = getApp();
  if (app) app.innerHTML = html;
}

function renderRestricted(user) {
  const statusText = String(user?.status || 'RESTRICTED').replace(/</g, '&lt;');
  const notes = user?.businessProfile?.verification?.reviewerNotes
    ? `<p style="color:var(--color-text-secondary);font-size:var(--text-sm);margin-top:8px;">Notes: ${String(user.businessProfile.verification.reviewerNotes).replace(/</g, '&lt;')}</p>`
    : '';
  renderPage(`
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
      <div class="card-soft p-8 text-center" style="max-width:440px;">
        <div style="font-size:48px;margin-bottom:16px;">🚫</div>
        <h2 style="font-size:var(--text-2xl);font-weight:800;margin-bottom:8px;">Access Restricted</h2>
        <p style="color:var(--color-text-muted);">Your account status is <strong>${statusText}</strong>. Please contact platform support.</p>
        ${notes}
        <button onclick="handleSignOut()" class="btn btn-ghost btn-full" style="margin-top:16px;">Sign Out</button>
      </div>
    </div>
  `);
}

function requireAuth(handler, { allowPending = false } = {}) {
  return async (params, query) => {
    if (!store.user) {
      navigate('/login', true);
      return;
    }
    const dest = resolvePortalDestination(store.user);
    if (dest.portal === 'RESTRICTED') {
      renderRestricted(store.user);
      return;
    }
    if (!allowPending && dest.portal === 'PENDING') {
      navigate('/pending', true);
      return;
    }
    await handler(params, query, dest);
  };
}

// ── Route Definitions ─────────────────────────────────────────────────────────
route('/', () => {
  if (store.user && store.user.status === 'ACTIVE') {
    const dest = resolvePortalDestination(store.user);
    navigate(dest.route, true);
  } else {
    renderWelcome(getApp());
  }
});

route('/welcome', () => renderWelcome(getApp()));

route('/role-select', (_params, query) => {
  const googleProfile = query?.google ? { email: query.email, name: query.name } : null;
  renderRoleSelect(getApp(), googleProfile);
});

route('/login', (_params, query) => {
  const allowSwitch = Boolean(query?.switch || query?.linkGoogle || query?.error);
  if (!allowSwitch && store.user && store.user.status === 'ACTIVE') {
    const dest = resolvePortalDestination(store.user);
    navigate(dest.route, true);
    return;
  }
  renderLogin(getApp(), query);
});

route('/worker-access', (_params, query) => {
  if (!query?.switch && store.user && store.user.role === 'WORKER' && store.user.status === 'ACTIVE') {
    navigate('/dashboard/worker', true);
    return;
  }
  renderWorkerAccess(getApp(), query);
});

route('/register/:role', (params, query) => renderRegister(getApp(), params, query));

route('/pending', requireAuth(() => {
  renderPending(getApp());
}, { allowPending: true }));

route('/restricted', requireAuth(() => {
  renderRestricted(store.user);
}, { allowPending: true }));

route('/forgot-password', () => renderForgotPw(getApp()));
route('/reset-password', (_params, query) => renderResetPw(getApp(), query));
route('/verify-email', (_params, query) => renderVerifyEmail(getApp(), query));

async function renderResolvedDashboard(_params, _query, dest) {
  const target = dest || resolvePortalDestination(store.user);
  if (target.portal === 'PENDING') {
    navigate('/pending', true);
    return;
  }
  if (target.portal === 'RESTRICTED') {
    renderRestricted(store.user);
    return;
  }
  // Canonicalize the URL hash to the user's backend-authorized portal route
  // so typing /dashboard/admin as a Buyer never retains an admin URL.
  const canonicalHash = '#' + target.route;
  if (location.hash !== canonicalHash) {
    history.replaceState(null, '', canonicalHash);
  }
  const handler = await getDashboardByPortal(target.portal);
  if (!handler) {
    navigate('/login', true);
    return;
  }
  handler(getApp());
}

route('/dashboard', requireAuth(renderResolvedDashboard));

// Role-specific URLs ALWAYS resolve from the authenticated backend identity, never the URL slug
route('/dashboard/:role', requireAuth(renderResolvedDashboard));

route('/demo/:role', async (params) => {
  const role = params.role?.toUpperCase();
  const demoUser = DEMO_USERS[role] || DEMO_USERS.RETAILER;
  setState({ user: demoUser, demoMode: true, sessionChecked: true });
  persistUser(demoUser);
  showToast(`Demo mode: ${demoUser.fullName} (${demoUser.role})`, 'info');
  const dest = resolvePortalDestination(demoUser);
  const handler = await getDashboardByPortal(dest.portal);
  if (handler) handler(getApp());
});

route('*', () => {
  renderPage(`
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
      <div class="card-soft p-8 text-center animate-scaleIn" style="max-width:420px;">
        <div style="font-size:64px;margin-bottom:16px;">🔍</div>
        <h2 style="font-size:var(--text-2xl);font-weight:800;">Page Not Found</h2>
        <p style="color:var(--color-text-muted);margin:12px 0;">The page you're looking for doesn't exist.</p>
        <button onclick="navigate('/')" class="btn btn-primary btn-full">← Go Home</button>
      </div>
    </div>
  `);
});

window.navigate = navigate;
window.showToast = showToast;
window.handleSignOut = async () => {
  try { await api.logout(); } catch {}
  persistUser(null);
  broadcastSessionIdentity(null);
  setState({ user: null, sessionChecked: false, demoMode: false });
  navigate('/');
};

// Detect cross-tab session switches (e.g., Super Admin logs in on Tab 2 while applicant is on Tab 1)
window.addEventListener('storage', (event) => {
  if (event.key !== SESSION_OWNER_KEY || !event.newValue || store.demoMode) return;
  try {
    const owner = JSON.parse(event.newValue);
    if (!store.user) return;
    if (owner.uid && owner.uid !== store.user.id) {
      showToast(
        `Another account (${owner.email || owner.role}) signed in on another tab. Use separate browser profiles to stay signed in to two accounts at once.`,
        'warning',
        7000
      );
    } else if (!owner.uid) {
      persistUser(null);
      setState({ user: null, sessionChecked: true, demoMode: false });
      navigate('/login', true);
    }
  } catch {}
});

async function init() {
  const restored = restoreUser();
  if (restored) {
    setState({ user: restored, sessionChecked: false });
  }
  const currentHash = (location.hash || '').replace(/^#/, '');
  const onPendingRoute = currentHash === '/pending' || currentHash.startsWith('/pending?');
  try {
    // Always verify HttpOnly session cookie on boot (essential after Google OAuth redirect)
    const me = await api.me();
    // Preserve pending applicant identity detection if another tab logged into an admin account
    if (onPendingRoute && restored && restored.id && !isAdminRole(restored.role) && me.id !== restored.id) {
      setState({ user: restored, sessionChecked: true, demoMode: false });
    } else {
      setState({ user: me, sessionChecked: true, demoMode: false });
      persistUser(me);
    }
  } catch (err) {
    if (err.status === 401) {
      persistUser(null);
      setState({ user: null, sessionChecked: true, demoMode: false });
    } else {
      // Never auto-promote a real user session into demoMode on transient API errors
      setState({ sessionChecked: true, demoMode: false });
    }
  }
  startRouter();
}

init();
