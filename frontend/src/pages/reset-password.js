/**
 * SAHAYAK B2B — Reset Password Completion Page (#/reset-password?token=...)
 */

import { api } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { esc } from '../utils/sanitize.js';

export default function renderResetPassword(container, query = {}) {
  const token = query.token || '';

  container.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--color-bg,#f8f7fc);">
      <div class="card-soft p-8" style="max-width:440px;width:100%;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;cursor:pointer;" onclick="navigate('/')">
          <img src="/logo.jpg" alt="Sahayak Logo" style="width:40px;height:40px;object-fit:contain;" />
          <span style="font-size:18px;font-weight:900;">SAHAYAK <span style="color:var(--color-primary);">B2B</span></span>
        </div>

        <h1 style="font-size:var(--text-2xl);font-weight:800;margin-bottom:8px;">Set a New Password</h1>
        <p style="color:var(--color-text-muted);font-size:var(--text-sm);margin-bottom:20px;">
          Enter your reset token and choose a strong new password (at least 8 characters).
        </p>

        <div id="rp-error" class="alert alert-danger hidden" style="margin-bottom:16px;"><span>⚠️</span><span id="rp-error-msg"></span></div>

        <form id="rp-form">
          <div class="form-group">
            <label class="form-label" for="rp-token">Reset Token</label>
            <input id="rp-token" type="text" class="input-field" value="${esc(token)}" placeholder="Paste token from reset link" required />
          </div>
          <div class="form-group" style="margin-top:12px;">
            <label class="form-label" for="rp-password">New Password</label>
            <input id="rp-password" type="password" class="input-field" minlength="8" placeholder="Min 8 characters" required />
          </div>
          <div class="form-group" style="margin-top:12px;">
            <label class="form-label" for="rp-confirm">Confirm New Password</label>
            <input id="rp-confirm" type="password" class="input-field" minlength="8" placeholder="Re-enter password" required />
          </div>
          <button type="submit" id="rp-submit" class="btn btn-primary btn-full btn-lg" style="margin-top:20px;">
            Update Password
          </button>
        </form>

        <div style="text-align:center;margin-top:16px;">
          <a href="#/login" style="font-size:var(--text-sm);color:var(--color-primary);font-weight:600;">← Back to Sign In</a>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector('#rp-form');
  const errBox = container.querySelector('#rp-error');
  const errMsg = container.querySelector('#rp-error-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    const tok = container.querySelector('#rp-token').value.trim();
    const pw = container.querySelector('#rp-password').value;
    const confirm = container.querySelector('#rp-confirm').value;

    if (pw !== confirm) {
      errMsg.textContent = 'Passwords do not match.';
      errBox.classList.remove('hidden');
      return;
    }

    const btn = container.querySelector('#rp-submit');
    btn.disabled = true;
    try {
      await api.resetPassword(tok, pw);
      showToast('Password updated! Please sign in with your new password.', 'success');
      navigate('/login');
    } catch (err) {
      errMsg.textContent = err.message || 'Password reset failed.';
      errBox.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });
}
