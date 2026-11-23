/**
 * SAHAYAK B2B — Application Bootstrap
 * Routes all 5 primary portals + dedicated Worker Access + Email Verification & Password Reset.
 */

import './styles/design-system.css';
import './styles/components.css';
import './styles/animations.css';

import { route, navigate, startRouter } from './router.js';
import { store, setState, restoreUser, persistUser, DEMO_USERS } from './store.js';
import { api } from './api.js';
import { showToast } from './components/toast.js';

import renderWelcome from './pages/welcome.js';
import renderRoleSelect from './pages/role-select.js';
import renderLogin from './pages/login.js';
import renderRegister from './pages/register.js';
import renderPending from './pages/pending.js';
import renderForgotPw from './pages/forgot-password.js';
import renderResetPw from './pages/reset-password.js';
import renderVerifyEmail from './pages/verify-email.js';
import renderWorkerAccess from './pages/worker-login.js';

const ADMIN_ROLES = new Set([
  'SUPER_ADMIN', 'VERIFICATION_ADMIN', 'FINANCE_ADMIN',
  'OPERATIONS_ADMIN', 'SUPPORT_ADMIN', 'LOGISTICS_ADMIN', 'ANALYTICS_ADMIN'
]);

const PENDING_STATUSES = new Set([
  'PENDING_VERIFICATION', 'INCOMPLETE_PROFILE', 'NEEDS_INFO', 'ON_HOLD'
]);

const dashboardModules = {};
async function getDashboard(role) {
  const isSeller = ['WHOLESALER', 'MANUFACTURER', 'DISTRIBUTOR', 'SUPPLIER'].includes(role);
  const key = ADMIN_ROLES.has(role) ? 'ADMIN' : isSeller ? 'SELLER' : role;
  if (!dashboardModules[key]) {
    switch (key) {
      case 'RETAILER':
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
        dashboardModules[key] = (await import('./pages/dashboard/retailer.js')).default;
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

function requireAuth(handler, { allowPending = false } = {}) {
  return async (params, query) => {
    if (!store.user) {
      navigate('/login', true);
      return;
    }
    if (!allowPending && PENDING_STATUSES.has(store.user.status)) {
      navigate('/pending', true);
      return;
    }
    if (store.user.status === 'REJECTED' || store.user.status === 'SUSPENDED') {
      renderPage(`
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
          <div class="card-soft p-8 text-center" style="max-width:420px;">
            <div style="font-size:48px;margin-bottom:16px;">🚫</div>
            <h2 style="font-size:var(--text-2xl);font-weight:800;margin-bottom:8px;">Access Restricted</h2>
            <p style="color:var(--color-text-muted);">Your account status is <strong>${store.user.status}</strong>. Please contact platform support.</p>
            <button onclick="handleSignOut()" class="btn btn-ghost btn-full" style="margin-top:16px;">Sign Out</button>
          </div>
        </div>
      `);
      return;
    }
    await handler(params, query);
  };
}

// ── Route Definitions ─────────────────────────────────────────────────────────
route('/', () => {
  if (store.user && store.user.status === 'ACTIVE') {
    navigate('/dashboard', true);
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
  if (store.user && store.user.status === 'ACTIVE') {
    navigate('/dashboard', true);
    return;
  }
  renderLogin(getApp(), query);
});

route('/worker-access', (_params, query) => {
  if (store.user && store.user.role === 'WORKER' && store.user.status === 'ACTIVE') {
    navigate('/dashboard', true);
    return;
  }
  renderWorkerAccess(getApp(), query);
});

route('/register/:role', (params) => renderRegister(getApp(), params));

route('/pending', requireAuth(() => {
  renderPending(getApp());
}, { allowPending: true }));

route('/forgot-password', () => renderForgotPw(getApp()));
route('/reset-password', (_params, query) => renderResetPw(getApp(), query));
route('/verify-email', (_params, query) => renderVerifyEmail(getApp(), query));

route('/dashboard', requireAuth(async () => {
  const handler = await getDashboard(store.user.role);
  handler(getApp());
}));

// Role-specific URLs always resolve from the authenticated session role, never the URL slug
route('/dashboard/:role', requireAuth(async () => {
  const handler = await getDashboard(store.user.role);
  handler(getApp());
}));

route('/demo/:role', async (params) => {
  const role = params.role?.toUpperCase();
  const demoUser = DEMO_USERS[role] || DEMO_USERS.RETAILER;
  setState({ user: demoUser, demoMode: true, sessionChecked: true });
  persistUser(demoUser);
  showToast(`Demo mode: ${demoUser.fullName} (${demoUser.role})`, 'info');
  const handler = await getDashboard(demoUser.role);
  handler(getApp());
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
  setState({ user: null, sessionChecked: false, demoMode: false });
  navigate('/');
};

async function init() {
  const restored = restoreUser();
  if (restored) {
    setState({ user: restored, sessionChecked: false });
    try {
      const me = await api.me();
      setState({ user: me, sessionChecked: true, demoMode: false });
      persistUser(me);
    } catch (err) {
      if (err.status === 401) {
        persistUser(null);
        setState({ user: null, sessionChecked: true, demoMode: false });
      } else {
        setState({ sessionChecked: true, demoMode: true });
      }
    }
  } else {
    setState({ sessionChecked: true });
  }
  startRouter();
}

init();
