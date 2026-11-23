/**
 * SAHAYAK B2B — Account Type / Role Selection Page
 * Allows new users to choose their business role or complete Google OAuth onboarding
 */

import { navigate } from '../router.js';
import { api } from '../api.js';
import { showToast } from '../components/toast.js';
import { setState, persistUser } from '../store.js';

const ROLES = [
  {
    id: 'retailer',
    roleKey: 'RETAILER',
    title: 'Buyer / Retailer',
    icon: '🛒',
    desc: 'Buyer Portal · Discover verified suppliers, send RFQs, compare quotes, negotiate bulk orders',
    perks: ['Supplier & product discovery', 'Multi-supplier RFQ comparison', 'KAEN automated negotiation']
  },
  {
    id: 'wholesaler',
    roleKey: 'WHOLESALER',
    title: 'Wholesaler (Seller Portal)',
    icon: '📦',
    desc: 'Seller Portal · Manage bulk catalogues, respond to RFQs, connect with manufacturers',
    perks: ['Bulk tier pricing & inventory', 'Manufacturer partnership requests', 'Direct buyer quotation pipeline']
  },
  {
    id: 'manufacturer',
    roleKey: 'MANUFACTURER',
    title: 'Manufacturer (Seller Portal)',
    icon: '🏭',
    desc: 'Seller Portal · Factory profile, production capacity, raw materials & distributor network',
    perks: ['Factory & production orders', 'Distributor partnership approvals', 'OEM & supply agreements']
  },
  {
    id: 'distributor',
    roleKey: 'DISTRIBUTOR',
    title: 'Distributor (Seller Portal)',
    icon: '🏬',
    desc: 'Seller Portal · Regional distribution, stock transfers, multi-brand bulk supply',
    perks: ['Regional distribution coverage', 'Multi-warehouse stock tracking', 'Manufacturer-to-retailer supply']
  },
  {
    id: 'supplier',
    roleKey: 'SUPPLIER',
    title: 'Supplier / Trader (Seller Portal)',
    icon: '🤝',
    desc: 'Seller Portal · Catalogue listings, RFQ responses, KAEN bargaining & direct B2B sales',
    perks: ['Fast catalogue onboarding', 'Flexible quotation management', 'Direct B2B buyer messaging']
  },
  {
    id: 'logistics',
    roleKey: 'LOGISTICS',
    title: 'Transport & Logistics Partner',
    icon: '🚚',
    desc: 'Logistics Portal · Accept shipment requests, manage vehicles & drivers, submit PODs',
    perks: ['B2B shipment quoting', 'Fleet & driver assignment', 'Structured delivery tracking & POD']
  }
];

export default function renderRoleSelect(container, googleProfile = null) {
  let selectedRole = null; // Stores selected role id, e.g. 'retailer'

  const profileName = googleProfile?.fullName || googleProfile?.name || googleProfile?.email?.split('@')[0] || 'User';

  container.innerHTML = `
    <div class="role-select-wrapper">
      <div class="role-select-container">
        <!-- Header -->
        <header class="role-select-header">
          <button id="role-back-btn" class="btn btn-ghost btn-sm role-back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
          <div class="role-logo" style="display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="navigate('/')">
            <img src="/logo.jpg" alt="Sahayak Logo" style="width:40px;height:40px;object-fit:contain;" />
            <span class="role-logo-text">SAHAYAK <span class="role-logo-accent">B2B</span></span>
          </div>
        </header>

        <!-- Google OAuth Banner if Google profile is present -->
        ${googleProfile ? `
          <div class="role-google-banner alert alert-info">
            <div class="role-google-icon-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
            </div>
            <div class="role-google-banner-text">
              <strong>Google Account Verified:</strong> You signed in with Google as <strong>${escapeHtml(profileName)}</strong>. Please choose your account type to continue.
            </div>
          </div>
        ` : ''}

        <!-- Title Section -->
        <div class="role-select-title-block">
          <span class="badge badge-brand mb-2">Step 1 of 2</span>
          <h1 class="role-select-title">Choose Your Business Role</h1>
          <p class="role-select-subtitle">
            Select how your organization participates in the B2B supply chain.
            Your portal tools, RFQ engines, and dashboards will be tailored to your choice.
          </p>
        </div>

        <!-- Validation Error Message Box -->
        <div id="role-select-error" class="alert alert-danger hidden" style="margin-bottom: 20px;">
          <span>⚠️</span>
          <span id="role-select-error-text">Please select a role to proceed.</span>
        </div>

        <!-- 2x2 Role Selection Grid -->
        <div class="role-cards-grid" role="radiogroup" aria-label="Business role selection">
          ${ROLES.map(role => `
            <div
              class="role-card"
              data-role-id="${role.id}"
              data-role-key="${role.roleKey}"
              tabindex="0"
              role="radio"
              aria-checked="false"
              id="role-card-${role.id}"
            >
              <div class="role-card-top">
                <div class="role-card-icon">${role.icon}</div>
                <div class="role-check-indicator" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              </div>
              <h3 class="role-card-title">${role.title}</h3>
              <p class="role-card-desc">${role.desc}</p>

              <div class="role-perks-list">
                ${role.perks.map(perk => `
                  <div class="role-perk-item">
                    <span class="role-perk-bullet">✓</span>
                    <span>${perk}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Action Section -->
        <div class="role-select-actions">
          <button
            id="role-btn-continue"
            class="btn btn-primary btn-xl btn-full role-submit-btn"
          >
            ${googleProfile ? 'Complete Google Registration' : 'Continue with Selected Role'}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        <!-- Admin Invite Only Notice & Sign In Link -->
        <footer class="role-select-footer">
          <div class="role-admin-notice">
            <span class="role-admin-icon">🔒</span>
            <span>Platform Admin accounts are strictly invite-only via Super Admin.</span>
          </div>

          <div class="role-signin-link">
            Already registered?
            <a href="#/login" id="link-goto-login" class="font-semibold text-brand">Sign in to your account</a>
          </div>
        </footer>
      </div>
    </div>

    <style>
      .role-select-wrapper {
        min-height: 100vh;
        width: 100%;
        background: var(--color-bg);
        display: flex;
        justify-content: center;
        align-items: center;
        padding: var(--space-8) var(--space-4);
      }

      .role-select-container {
        width: 100%;
        max-width: 860px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-2xl);
        box-shadow: var(--shadow-xl);
        padding: var(--space-8) var(--space-8) var(--space-6);
        display: flex;
        flex-direction: column;
      }

      .role-select-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-6);
        position: relative;
      }

      .role-back-btn {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        color: var(--color-text-secondary);
      }

      .role-logo {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      .role-logo-icon {
        width: 32px;
        height: 32px;
        border-radius: var(--radius-md);
        background: var(--grad-primary);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: var(--text-sm);
      }

      .role-logo-text {
        font-size: var(--text-base);
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--color-text-primary);
      }

      .role-logo-accent {
        color: var(--color-primary);
      }

      .role-google-banner {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin-bottom: var(--space-6);
        border-radius: var(--radius-lg);
        background: #F0F4FF;
        border: 1px solid #C7D8FE;
        color: #1E3A8A;
      }

      .role-google-icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .role-google-banner-text {
        font-size: var(--text-sm);
        line-height: 1.5;
      }

      .role-select-title-block {
        text-align: center;
        margin-bottom: var(--space-6);
      }

      .role-select-title {
        font-size: clamp(1.5rem, 3vw, 2rem);
        font-weight: 800;
        letter-spacing: -0.03em;
        color: var(--color-text-primary);
        margin-bottom: var(--space-2);
      }

      .role-select-subtitle {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        max-width: 620px;
        margin: 0 auto;
        line-height: 1.6;
      }

      .role-cards-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-5);
        margin-bottom: var(--space-6);
      }

      .role-card {
        background: white;
        border: 2px solid var(--color-border);
        border-radius: var(--radius-xl);
        padding: var(--space-5);
        cursor: pointer;
        transition: all var(--transition-base);
        position: relative;
        outline: none;
        display: flex;
        flex-direction: column;
      }

      .role-card:hover {
        border-color: var(--color-brand-300);
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
      }

      .role-card:focus-visible {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.2);
      }

      .role-card.selected {
        border-color: var(--color-primary);
        background: #FAF8FF;
        box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.18), var(--shadow-md);
      }

      .role-card.selected .role-check-indicator {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: white;
        opacity: 1;
        transform: scale(1);
      }

      .role-card-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-3);
      }

      .role-card-icon {
        width: 46px;
        height: 46px;
        border-radius: var(--radius-md);
        background: var(--grad-soft);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
      }

      .role-check-indicator {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 2px solid var(--color-border-strong);
        display: flex;
        align-items: center;
        justify-content: center;
        color: transparent;
        opacity: 0.6;
        transition: all var(--transition-fast);
      }

      .role-card-title {
        font-size: var(--text-base);
        font-weight: 700;
        color: var(--color-text-primary);
        margin-bottom: var(--space-1);
      }

      .role-card-desc {
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
        line-height: 1.55;
        margin-bottom: var(--space-3);
        flex: 1;
      }

      .role-perks-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-top: var(--space-2);
        border-top: 1px dashed var(--color-border);
      }

      .role-perk-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--color-text-muted);
        line-height: 1.4;
      }

      .role-perk-bullet {
        color: var(--color-primary);
        font-weight: 700;
        font-size: 11px;
      }

      .role-select-actions {
        margin-bottom: var(--space-6);
      }

      .role-submit-btn {
        box-shadow: 0 4px 16px rgba(109, 40, 217, 0.35);
      }

      .role-select-footer {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        align-items: center;
        border-top: 1px solid var(--color-border);
        padding-top: var(--space-4);
      }

      .role-admin-notice {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: 6px 14px;
        border-radius: var(--radius-full);
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        font-weight: 500;
      }

      .role-admin-icon {
        font-size: 12px;
      }

      .role-signin-link {
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
      }

      @media (max-width: 768px) {
        .role-cards-grid {
          grid-template-columns: 1fr;
          gap: var(--space-4);
        }

        .role-select-container {
          padding: var(--space-5) var(--space-4);
        }
      }
    </style>
  `;

  // UI Elements
  const errorBox = container.querySelector('#role-select-error');
  const errorText = container.querySelector('#role-select-error-text');
  const continueBtn = container.querySelector('#role-btn-continue');
  const backBtn = container.querySelector('#role-back-btn');
  const loginLink = container.querySelector('#link-goto-login');
  const roleCards = container.querySelectorAll('.role-card');

  function showError(msg) {
    if (errorBox && errorText) {
      errorText.textContent = msg;
      errorBox.classList.remove('hidden');
    }
  }

  function hideError() {
    if (errorBox) {
      errorBox.classList.add('hidden');
    }
  }

  // Handle Card Selection
  roleCards.forEach(card => {
    card.addEventListener('click', () => {
      hideError();
      roleCards.forEach(c => {
        c.classList.remove('selected');
        c.setAttribute('aria-checked', 'false');
      });

      card.classList.add('selected');
      card.setAttribute('aria-checked', 'true');
      selectedRole = card.dataset.roleId; // e.g. 'retailer'
    });

    // Keyboard navigation (Enter / Space)
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });

  // Handle Google Complete
  async function handleGoogleComplete() {
    if (!selectedRole) {
      showError('Please choose your account type to complete Google registration.');
      showToast('Please select a role to continue.', 'warning');
      return;
    }

    continueBtn.disabled = true;
    continueBtn.classList.add('btn-loading');
    hideError();

    try {
      const codeOrToken = googleProfile?.code || googleProfile?.idToken || '';
      const selectedRoleKey = selectedRole.toUpperCase();

      const result = await api.googleCallback(codeOrToken, selectedRoleKey);

      if (result.status === 'AUTHENTICATED' && result.user) {
        persistUser(result.user);
        setState({ user: result.user });
        showToast('Google registration complete! Welcome to Sahayak B2B.', 'success');

        if (result.user.status === 'PENDING_VERIFICATION') {
          navigate('/pending');
        } else {
          const roleSlug = (result.user.role || selectedRole).toLowerCase();
          navigate(`/dashboard/${roleSlug}`);
        }
      } else {
        showToast('Account setup updated. Redirecting to registration...', 'info');
        navigate(`/register/${selectedRole.toLowerCase()}`);
      }
    } catch (err) {
      showError(err.message || 'Failed to complete Google registration. Please try again.');
      showToast(err.message || 'Registration failed.', 'error');
    } finally {
      continueBtn.disabled = false;
      continueBtn.classList.remove('btn-loading');
    }
  }

  // Handle Continue Button Click
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      if (!selectedRole) {
        showError('Please select a business role to continue.');
        showToast('Please select an account type.', 'warning');
        return;
      }

      if (googleProfile) {
        handleGoogleComplete();
      } else {
        // Navigate to role registration page
        navigate(`/register/${selectedRole.toLowerCase()}`);
      }
    });
  }

  // Back button
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      navigate('/');
    });
  }

  // Login link
  if (loginLink) {
    loginLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigate('/login');
    });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
