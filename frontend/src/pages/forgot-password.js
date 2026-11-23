/**
 * SAHAYAK B2B — Password Reset Request Page
 * Sends a password reset link to registered business email
 */

import { navigate } from '../router.js';
import { api } from '../api.js';
import { showToast } from '../components/toast.js';

export default function renderForgotPassword(container) {
  container.innerHTML = `
    <div class="forgot-pwd-wrapper">
      <div class="forgot-pwd-card card-soft">
        <!-- Back Navigation -->
        <button id="btn-back-to-login" class="btn btn-ghost btn-sm forgot-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Sign In
        </button>

        <!-- Initial Form Container -->
        <div id="forgot-form-view">
          <div class="forgot-icon-wrap">
            <div class="forgot-icon-box">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
          </div>

          <h1 class="forgot-title">Reset Your Password</h1>
          <p class="forgot-subtitle">
            Enter the registered business email associated with your Sahayak account. We'll send you a secure link to create a new password.
          </p>

          <!-- Error Alert -->
          <div id="forgot-error-alert" class="alert alert-danger hidden" style="margin-bottom: 18px;" role="alert">
            <span>⚠️</span>
            <span id="forgot-error-msg">Please enter a valid email address.</span>
          </div>

          <!-- Form -->
          <form id="forgot-password-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="forgot-email">BUSINESS EMAIL</label>
              <input
                id="forgot-email"
                type="email"
                class="input-field"
                placeholder="name@company.com"
                autocomplete="email"
                required
              />
            </div>

            <button type="submit" id="btn-send-reset" class="btn btn-primary btn-full btn-lg forgot-submit-btn">
              Send Reset Link
            </button>
          </form>
        </div>

        <!-- Success State Container (Hidden Initially) -->
        <div id="forgot-success-view" class="hidden">
          <div class="forgot-icon-wrap">
            <div class="forgot-success-icon-box">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
          </div>

          <h2 class="forgot-title">Check your email for a reset link</h2>

          <p class="forgot-subtitle">
            We've sent password reset instructions to <strong id="forgot-sent-email" class="text-primary"></strong>.
            Please check your inbox (and spam folder) and follow the link to reset your credentials.
          </p>

          <div class="forgot-success-actions">
            <div id="forgot-dev-link" style="margin-bottom:12px;width:100%;"></div>
            <button id="btn-success-back-login" class="btn btn-primary btn-full btn-lg">
              Return to Sign In
            </button>
            <button id="btn-resend-reset" class="btn btn-ghost btn-sm" style="margin-top: 8px;">
              Didn't receive email? Try another address
            </button>
          </div>
        </div>
      </div>
    </div>

    <style>
      .forgot-pwd-wrapper {
        min-height: 100vh;
        width: 100%;
        background: var(--color-bg);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-8) var(--space-4);
      }

      .forgot-pwd-card {
        width: 100%;
        max-width: 460px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-2xl);
        padding: var(--space-8);
        box-shadow: var(--shadow-xl);
      }

      .forgot-back-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        color: var(--color-text-secondary);
        padding-left: 0;
        margin-bottom: var(--space-5);
      }

      .forgot-icon-wrap {
        display: flex;
        justify-content: center;
        margin-bottom: var(--space-4);
      }

      .forgot-icon-box {
        width: 60px;
        height: 60px;
        border-radius: var(--radius-xl);
        background: var(--grad-soft);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(124, 58, 237, 0.15);
      }

      .forgot-success-icon-box {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: var(--color-success-bg);
        border: 2px solid var(--color-success);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 16px rgba(5, 150, 105, 0.2);
        animation: scaleIn 0.35s var(--transition-spring);
      }

      .forgot-title {
        font-size: var(--text-2xl);
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--color-text-primary);
        text-align: center;
        margin-bottom: var(--space-2);
      }

      .forgot-subtitle {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        text-align: center;
        line-height: 1.6;
        margin-bottom: var(--space-6);
      }

      .forgot-submit-btn {
        margin-top: var(--space-2);
        box-shadow: 0 4px 14px rgba(109, 40, 217, 0.35);
      }

      .forgot-success-actions {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: var(--space-4);
      }
    </style>
  `;

  // UI Element References
  const formView = container.querySelector('#forgot-form-view');
  const successView = container.querySelector('#forgot-success-view');
  const form = container.querySelector('#forgot-password-form');
  const emailInput = container.querySelector('#forgot-email');
  const submitBtn = container.querySelector('#btn-send-reset');
  const backBtn = container.querySelector('#btn-back-to-login');
  const successBackBtn = container.querySelector('#btn-success-back-login');
  const resendBtn = container.querySelector('#btn-resend-reset');
  const sentEmailEl = container.querySelector('#forgot-sent-email');
  const errorAlert = container.querySelector('#forgot-error-alert');
  const errorMsg = container.querySelector('#forgot-error-msg');

  function showError(msg) {
    if (errorAlert && errorMsg) {
      errorMsg.textContent = msg;
      errorAlert.classList.remove('hidden');
    }
  }

  function hideError() {
    if (errorAlert) {
      errorAlert.classList.add('hidden');
    }
  }

  // Back button navigation
  if (backBtn) {
    backBtn.addEventListener('click', () => navigate('/login'));
  }

  if (successBackBtn) {
    successBackBtn.addEventListener('click', () => navigate('/login'));
  }

  // Resend / change email button
  if (resendBtn) {
    resendBtn.addEventListener('click', () => {
      successView.classList.add('hidden');
      formView.classList.remove('hidden');
      if (emailInput) {
        emailInput.disabled = false;
        emailInput.focus();
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-loading');
      }
    });
  }

  // Form submission
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const email = emailInput?.value.trim();
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!email || !emailPattern.test(email)) {
        showError('Please enter a valid business email address.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.classList.add('btn-loading');

      try {
        const res = await api.forgotPassword(email);
        showToast('Password reset link generated.', 'success');

        emailInput.disabled = true;
        if (sentEmailEl) sentEmailEl.textContent = email;
        const devLinkBox = container.querySelector('#forgot-dev-link');
        if (devLinkBox && res?._devResetToken) {
          devLinkBox.innerHTML = `<div class="alert alert-info" style="font-size:var(--text-xs);text-align:left;"><span>🔧</span><div><strong>Dev Mode (No SMTP):</strong> <a href="#/reset-password?token=${encodeURIComponent(res._devResetToken)}" style="color:var(--color-primary);font-weight:700;">Open Reset Password Page →</a></div></div>`;
        }
        formView.classList.add('hidden');
        successView.classList.remove('hidden');
      } catch (err) {
        // Even if account not found, for security APIs usually return generic message or error
        const message = err.message || 'Failed to send password reset link. Please try again.';
        showError(message);
        showToast(message, 'error');
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-loading');
      }
    });
  }
}
