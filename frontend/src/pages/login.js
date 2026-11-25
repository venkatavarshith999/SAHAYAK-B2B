/**
 * SAHAYAK B2B — Authentication / Login Page
 * Supports password authentication, Google OAuth redirection, and 1-click role demo preview
 */

import { api } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { store, setState, persistUser, DEMO_USERS } from '../store.js';

export default function renderLogin(container, query = {}) {
  container.innerHTML = `
    <div class="auth-layout">
      <!-- Left Panel: Authentication Form -->
      <section class="auth-panel-left">
        <div class="auth-card">
          <!-- Logo & Header -->
          <div class="auth-brand-header">
            <div class="auth-logo-row" style="display:flex;align-items:center;gap:12px;margin-bottom:12px;cursor:pointer;" onclick="navigate('/')">
              <img src="/logo.jpg" alt="Sahayak Logo" style="width:48px;height:48px;object-fit:contain;" />
              <span class="auth-logo-text" style="font-size:24px;font-weight:900;letter-spacing:-0.03em;">SAHAYAK <span class="auth-logo-accent">B2B</span></span>
            </div>
            <h1 class="auth-title">Sign in to your account</h1>
            <p class="auth-subtitle">Welcome back. Enter your business credentials to access your portal.</p>
          </div>

          <!-- Error Alert Container -->
          <div id="login-error-alert" class="alert alert-danger hidden" style="margin-bottom: 18px;" role="alert">
            <span>⚠️</span>
            <span id="login-error-message">Invalid email or password.</span>
          </div>

          <!-- Secure Google Account Linking Panel (shown when existing password account signs in with Google) -->
          <div id="google-link-panel" class="hidden" style="margin-bottom:18px;padding:16px;border-radius:var(--radius-lg);background:#F5F3FF;border:1px solid var(--color-brand-200,#ddd6fe);">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <strong style="font-size:var(--text-sm);color:var(--color-primary);">Link Your Google Account</strong>
            </div>
            <p style="font-size:var(--text-xs);color:var(--color-text-secondary);line-height:1.5;margin-bottom:12px;">
              An existing Sahayak B2B account was found for <strong id="google-link-email"></strong>. Enter your current password once to securely verify ownership and link Google Sign-In.
            </p>
            <form id="google-link-form" novalidate>
              <div class="form-group" style="margin-bottom:10px;">
                <label class="form-label" for="google-link-password">CURRENT ACCOUNT PASSWORD</label>
                <input id="google-link-password" type="password" class="input-field" placeholder="Enter your existing password" autocomplete="current-password" required />
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="submit" id="btn-google-link-submit" class="btn btn-primary btn-sm" style="flex:1;min-width:160px;">Verify &amp; Link Google</button>
                <button type="button" id="btn-google-link-cancel" class="btn btn-ghost btn-sm">Cancel</button>
              </div>
            </form>
          </div>

          <!-- Google Sign-In Button -->
          <a
            href="/api/auth/google/redirect"
            id="btn-google-signin"
            class="btn btn-google btn-full btn-lg"
            style="text-decoration:none;"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" style="margin-right: 8px;">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Sign in with Google
          </a>

          <!-- Divider -->
          <div class="divider" style="margin: 22px 0;">or continue with email</div>

          <!-- Login Form -->
          <form id="login-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="login-email">BUSINESS EMAIL</label>
              <input
                id="login-email"
                type="email"
                class="input-field"
                placeholder="name@company.com"
                autocomplete="email"
                required
              />
            </div>

            <div class="form-group">
              <div class="login-pwd-label-row">
                <label class="form-label" for="login-password" style="margin-bottom:0;">PASSWORD</label>
                <a href="#/forgot-password" id="link-forgot-pwd" class="login-forgot-link">Forgot password?</a>
              </div>
              <div class="login-pwd-wrapper">
                <input
                  id="login-password"
                  type="password"
                  class="input-field"
                  placeholder="••••••••••••"
                  autocomplete="current-password"
                  required
                />
                <button
                  type="button"
                  id="btn-toggle-pwd"
                  class="login-toggle-pwd-btn"
                  aria-label="Toggle password visibility"
                  tabindex="-1"
                >
                  <svg id="pwd-icon-show" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg id="pwd-icon-hide" class="hidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>
            </div>

            <button type="submit" id="btn-submit-login" class="btn btn-primary btn-full btn-lg login-submit-btn">
              Sign In
            </button>
          </form>

          <!-- Register Link -->
          <div class="login-register-prompt">
            Don't have a business account?
            <a href="#/role-select" id="link-create-account" class="font-semibold text-brand">Register Business</a>
          </div>

          <!-- Separate Worker Access Entry -->
          <div style="margin-top:12px;padding:12px 14px;border-radius:var(--radius-md);background:var(--color-brand-50,#f5f3ff);border:1px solid var(--color-brand-200,#ddd6fe);display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div style="font-size:var(--text-xs);color:var(--color-text-secondary);">
              <strong>Organization Employee?</strong> Use the separate Worker Access flow.
            </div>
            <a href="#/worker-access" class="btn btn-white btn-sm" style="white-space:nowrap;font-weight:700;">👷 Worker Access</a>
          </div>

          <!-- Quick Preview / Demo Mode Section -->
          <div class="login-demo-container card-soft">
            <div class="login-demo-header">
              <span class="login-demo-badge">QUICK PREVIEW (DEMO MODE)</span>
              <span class="login-demo-caption">Instant 1-click role exploration:</span>
            </div>
            <div class="login-demo-buttons-grid">
              <button class="btn btn-white btn-sm demo-role-btn" data-role="RETAILER" type="button">
                🛒 Retailer
              </button>
              <button class="btn btn-white btn-sm demo-role-btn" data-role="WHOLESALER" type="button">
                📦 Wholesaler
              </button>
              <button class="btn btn-white btn-sm demo-role-btn" data-role="MANUFACTURER" type="button">
                🏭 Manufacturer
              </button>
              <button class="btn btn-white btn-sm demo-role-btn" data-role="LOGISTICS" type="button">
                🚚 Logistics
              </button>
              <button class="btn btn-white btn-sm demo-role-btn" data-role="SUPER_ADMIN" type="button">
                🛡️ Super Admin
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Right Panel: Gradient Showcase (hidden on mobile) -->
      <section class="auth-panel-right gradient-animate" aria-hidden="true">
        <div class="login-right-content">
          <div class="login-right-badge">
            <span class="badge badge-brand" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);">
              Autonomous Trade Engine
            </span>
          </div>

          <h2 class="login-right-headline">
            Smart Business.<br />
            Better Connections.<br />
            Stronger Trade.
          </h2>

          <p class="login-right-desc">
            Empowering verified Indian manufacturers, wholesalers, retailers, and logistics partners
            with AI-assisted negotiation and high-trust B2B commerce.
          </p>

          <!-- Floating Feature Chips -->
          <div class="login-chips-wall">
            <div class="chip login-feature-chip">
              <span>⚡</span> Instant RFQ Multi-Supplier Dispatch
            </div>
            <div class="chip login-feature-chip">
              <span>🤝</span> KAEN Concession Curve Negotiation
            </div>
            <div class="chip login-feature-chip">
              <span>🛡️</span> 100% GSTIN & KYC Verified Network
            </div>
            <div class="chip login-feature-chip">
              <span>📦</span> Bulk Inventory Catalogue Sync
            </div>
            <div class="chip login-feature-chip">
              <span>🚚</span> Real-Time Logistics Tracking & POD
            </div>
          </div>

          <!-- Bottom Capability Pill -->
          <div class="login-metric-pill">
            <div class="login-metric-stat">
              <strong>5 Portals</strong> <span>Role-Based</span>
            </div>
            <div class="login-metric-divider">|</div>
            <div class="login-metric-stat">
              <strong>KAEN</strong> <span>Negotiation</span>
            </div>
            <div class="login-metric-divider">|</div>
            <div class="login-metric-stat">
              <strong>Org-Scoped</strong> <span>RBAC</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <style>
      .auth-layout {
        min-height: 100vh;
        width: 100%;
        display: flex;
        background: var(--color-surface);
      }

      .auth-panel-left {
        flex: 1.1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-8) var(--space-6);
        background: var(--color-surface);
        min-height: 100vh;
      }

      .auth-card {
        width: 100%;
        max-width: 440px;
        display: flex;
        flex-direction: column;
      }

      .auth-brand-header {
        margin-bottom: var(--space-6);
      }

      .auth-logo-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin-bottom: var(--space-4);
      }

      .auth-logo-badge {
        width: 36px;
        height: 36px;
        border-radius: var(--radius-md);
        background: var(--grad-primary);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: var(--text-base);
        box-shadow: 0 4px 12px rgba(109, 40, 217, 0.3);
      }

      .auth-logo-text {
        font-size: var(--text-lg);
        font-weight: 900;
        letter-spacing: -0.02em;
        color: var(--color-text-primary);
      }

      .auth-logo-accent {
        color: var(--color-primary);
      }

      .auth-title {
        font-size: var(--text-2xl);
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--color-text-primary);
        margin-bottom: var(--space-1);
      }

      .auth-subtitle {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        line-height: 1.5;
      }

      .login-pwd-label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-2);
      }

      .login-forgot-link {
        font-size: var(--text-xs);
        color: var(--color-primary);
        font-weight: 600;
      }

      .login-pwd-wrapper {
        position: relative;
        display: flex;
        align-items: center;
      }

      .login-pwd-wrapper .input-field {
        padding-right: 44px;
      }

      .login-toggle-pwd-btn {
        position: absolute;
        right: 12px;
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
        cursor: pointer;
        transition: color var(--transition-fast);
      }

      .login-toggle-pwd-btn:hover {
        color: var(--color-text-primary);
      }

      .login-submit-btn {
        margin-top: var(--space-2);
        box-shadow: 0 4px 14px rgba(109, 40, 217, 0.35);
      }

      .login-register-prompt {
        text-align: center;
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin-top: var(--space-5);
      }

      /* Demo Mode Container */
      .login-demo-container {
        margin-top: var(--space-6);
        padding: var(--space-4);
        background: #F9F8FD;
        border: 1px dashed var(--color-brand-300);
        border-radius: var(--radius-lg);
      }

      .login-demo-header {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-bottom: var(--space-3);
      }

      .login-demo-badge {
        font-size: 11px;
        font-weight: 800;
        color: var(--color-primary);
        letter-spacing: 0.06em;
      }

      .login-demo-caption {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      .login-demo-buttons-grid {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }

      .demo-role-btn {
        background: white;
        border: 1px solid var(--color-border);
        color: var(--color-text-primary);
        font-size: 11px;
        font-weight: 600;
        padding: 6px 12px;
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);
      }

      .demo-role-btn:hover {
        background: var(--color-brand-100);
        border-color: var(--color-brand-300);
        color: var(--color-primary);
        transform: translateY(-1px);
      }

      /* Right Panel */
      .auth-panel-right {
        flex: 1;
        display: none;
        align-items: center;
        justify-content: center;
        padding: var(--space-10);
        position: relative;
        overflow: hidden;
      }

      .login-right-content {
        max-width: 480px;
        color: white;
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
        z-index: 2;
      }

      .login-right-headline {
        font-size: var(--text-3xl);
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: -0.02em;
        color: white;
      }

      .login-right-desc {
        font-size: var(--text-sm);
        color: rgba(255, 255, 255, 0.85);
        line-height: 1.65;
      }

      .login-chips-wall {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .login-feature-chip {
        background: rgba(255, 255, 255, 0.14);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.25);
        color: white;
        padding: 8px 16px;
        border-radius: var(--radius-full);
        font-size: var(--text-xs);
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        width: fit-content;
      }

      .login-metric-pill {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        padding: var(--space-3) var(--space-5);
        border-radius: var(--radius-xl);
        background: rgba(255, 255, 255, 0.12);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        margin-top: var(--space-3);
      }

      .login-metric-stat {
        display: flex;
        flex-direction: column;
      }

      .login-metric-stat strong {
        font-size: var(--text-base);
        font-weight: 800;
      }

      .login-metric-stat span {
        font-size: 11px;
        opacity: 0.8;
      }

      .login-metric-divider {
        opacity: 0.3;
      }

      @media (min-width: 1024px) {
        .auth-panel-right {
          display: flex;
        }
      }

      @media (max-width: 640px) {
        .auth-panel-left {
          padding: var(--space-6) var(--space-4);
        }
      }
    </style>
  `;

  // UI Element References
  const form = container.querySelector('#login-form');
  const emailInput = container.querySelector('#login-email');
  const passwordInput = container.querySelector('#login-password');
  const submitBtn = container.querySelector('#btn-submit-login');
  const errorAlert = container.querySelector('#login-error-alert');
  const errorMessage = container.querySelector('#login-error-message');
  const togglePwdBtn = container.querySelector('#btn-toggle-pwd');
  const iconShow = container.querySelector('#pwd-icon-show');
  const iconHide = container.querySelector('#pwd-icon-hide');
  const forgotPwdLink = container.querySelector('#link-forgot-pwd');
  const createAccountLink = container.querySelector('#link-create-account');
  const demoButtons = container.querySelectorAll('.demo-role-btn');
  const googleBtn = container.querySelector('#btn-google-signin');

  function showError(msg) {
    if (errorAlert && errorMessage) {
      errorMessage.textContent = msg;
      errorAlert.classList.remove('hidden');
    }
  }

  function hideError() {
    if (errorAlert) {
      errorAlert.classList.add('hidden');
    }
  }

  // Show OAuth redirect errors if present in query params
  if (query?.error) {
    const oauthMessages = {
      google_state_invalid: 'Google sign-in security check failed (invalid or expired state). Please try again.',
      google_cancelled: 'Google sign-in was cancelled.',
      google_failed: 'Google sign-in could not be completed. Please try again or contact support.',
      google_not_configured: 'Google OAuth is not configured on this server yet.',
      account_suspended: 'This account is suspended or rejected. Please contact platform support.',
      account_link_required: 'An account with this email already exists. Verify your password to link Google.'
    };
    showError(oauthMessages[query.error] || 'Authentication error occurred. Please try again.');
  }

  // Handle Google Account Linking flow when ?linkGoogle=1
  const linkPanel = container.querySelector('#google-link-panel');
  const linkEmailEl = container.querySelector('#google-link-email');
  const linkForm = container.querySelector('#google-link-form');
  const linkPwdInput = container.querySelector('#google-link-password');
  const linkSubmitBtn = container.querySelector('#btn-google-link-submit');
  const linkCancelBtn = container.querySelector('#btn-google-link-cancel');

  if (query?.linkGoogle) {
    api.googlePending()
      .then((pending) => {
        if (pending?.mode === 'LINK' && linkPanel && linkEmailEl) {
          linkEmailEl.textContent = pending.email;
          if (emailInput) emailInput.value = pending.email;
          linkPanel.classList.remove('hidden');
          linkPwdInput?.focus();
        } else {
          showError('Google linking session expired. Please click Sign in with Google again.');
        }
      })
      .catch(() => {
        showError('Google linking session expired. Please click Sign in with Google again.');
      });
  }

  if (linkCancelBtn && linkPanel) {
    linkCancelBtn.addEventListener('click', async () => {
      try { await api.googleCancel(); } catch {}
      linkPanel.classList.add('hidden');
      hideError();
      navigate('/login', true);
    });
  }

  if (linkForm) {
    linkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();
      const pwd = linkPwdInput?.value || '';
      if (!pwd) {
        showError('Please enter your existing account password to link Google.');
        return;
      }
      linkSubmitBtn.disabled = true;
      linkSubmitBtn.classList.add('btn-loading');
      try {
        const res = await api.googleLink(pwd);
        const user = res.user || res;
        persistUser(user);
        setState({ user, demoMode: false, sessionChecked: true });
        showToast('Google account linked! Welcome back.', 'success');
        if (['PENDING_VERIFICATION', 'NEEDS_INFO', 'ON_HOLD', 'INCOMPLETE_PROFILE'].includes(user.status)) {
          navigate('/pending');
        } else {
          navigate('/dashboard');
        }
      } catch (err) {
        const msg = err.message || 'Password verification failed. Please try again.';
        showError(msg);
        showToast(msg, 'error');
      } finally {
        linkSubmitBtn.disabled = false;
        linkSubmitBtn.classList.remove('btn-loading');
      }
    });
  }

  // Toggle Password Visibility
  if (togglePwdBtn && passwordInput) {
    togglePwdBtn.addEventListener('click', () => {
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
      if (iconShow && iconHide) {
        iconShow.classList.toggle('hidden', isPassword);
        iconHide.classList.toggle('hidden', !isPassword);
      }
    });
  }

  // Google OAuth Redirect
  if (googleBtn) {
    googleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      googleBtn.classList.add('btn-loading');
      window.location.href = api.googleRedirectUrl();
    });
  }

  // Forgot Password navigation
  if (forgotPwdLink) {
    forgotPwdLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigate('/forgot-password');
    });
  }

  // Create account navigation
  if (createAccountLink) {
    createAccountLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigate('/role-select');
    });
  }

  // Demo Mode 1-click Sign In
  function loginDemo(roleKey) {
    const user = DEMO_USERS[roleKey];
    if (!user) {
      showToast('Demo role profile not found.', 'error');
      return;
    }

    persistUser(user);
    setState({ user, demoMode: true });
    showToast(`Signed in as demo ${user.fullName} (${user.role})`, 'success');

    const roleSlug = user.role === 'SUPER_ADMIN' ? 'admin' : user.role.toLowerCase();
    navigate(`/dashboard/${roleSlug}`);
  }

  demoButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;
      loginDemo(role);
    });
  });

  // Handle Form Submission
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const email = emailInput?.value.trim();
      const password = passwordInput?.value;

      if (!email || !password) {
        showError('Please enter both your email address and password.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.classList.add('btn-loading');

      try {
        const res = await api.login(email, password);
        const user = res.user || res;

        persistUser(user);
        setState({ user, demoMode: false, sessionChecked: true });
        showToast(`Welcome back, ${user.fullName || user.email}!`, 'success');

        if (['PENDING_VERIFICATION', 'NEEDS_INFO', 'ON_HOLD', 'INCOMPLETE_PROFILE'].includes(user.status)) {
          navigate('/pending');
          return;
        }
        navigate('/dashboard');
      } catch (err) {
        const message = err.message || 'Invalid email or password. Please try again.';
        showError(message);
        showToast(message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-loading');
      }
    });
  }
}
