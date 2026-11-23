/**
 * SAHAYAK B2B — Email Verification Page (#/verify-email?token=...)
 */

import { api } from '../api.js';
import { navigate } from '../router.js';
import { esc } from '../utils/sanitize.js';

export default async function renderVerifyEmail(container, query = {}) {
  const token = query.token || '';

  container.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--color-bg,#f8f7fc);">
      <div class="card-soft p-8 text-center" style="max-width:440px;width:100%;">
        <div id="ve-status" style="font-size:48px;margin-bottom:16px;">✉️</div>
        <h1 id="ve-title" style="font-size:var(--text-2xl);font-weight:800;margin-bottom:8px;">Verifying your email…</h1>
        <p id="ve-desc" style="color:var(--color-text-muted);font-size:var(--text-sm);margin-bottom:20px;">Please wait while we confirm your email address.</p>
        <div id="ve-actions"></div>
      </div>
    </div>
  `;

  const statusEl = container.querySelector('#ve-status');
  const titleEl = container.querySelector('#ve-title');
  const descEl = container.querySelector('#ve-desc');
  const actionsEl = container.querySelector('#ve-actions');

  if (!token) {
    statusEl.textContent = '⚠️';
    titleEl.textContent = 'Missing Verification Token';
    descEl.textContent = 'The verification link appears incomplete.';
    actionsEl.innerHTML = `<button class="btn btn-primary btn-full" onclick="navigate('/login')">Go to Sign In</button>`;
    return;
  }

  try {
    await api.verifyEmail(token);
    statusEl.textContent = '✅';
    titleEl.textContent = 'Email Verified!';
    descEl.textContent = 'Your email address is now verified. Business accounts remain pending until admin document review completes.';
    actionsEl.innerHTML = `<button class="btn btn-primary btn-full" onclick="navigate('/login')">Continue to Sign In</button>`;
  } catch (err) {
    statusEl.textContent = '❌';
    titleEl.textContent = 'Verification Failed';
    descEl.textContent = esc(err.message || 'This verification link is invalid or has expired.');
    actionsEl.innerHTML = `<button class="btn btn-ghost btn-full" onclick="navigate('/login')">Return to Sign In</button>`;
  }
}
