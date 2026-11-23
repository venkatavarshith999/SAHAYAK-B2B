/**
 * SAHAYAK B2B — Dedicated Worker Access Portal (Login + Invite-Only Join)
 * Workers belong strictly to an existing organization and cannot register businesses.
 */

import { api } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { setState, persistUser } from '../store.js';
import { esc } from '../utils/sanitize.js';

export default function renderWorkerAccess(container, query = {}) {
  const initialTab = query.code ? 'join' : 'signin';
  const prefillCode = query.code || '';
  const prefillEmail = query.email || '';

  container.innerHTML = `
    <div class="auth-layout">
      <section class="auth-panel-left" style="padding:40px 24px;overflow-y:auto;">
        <div class="auth-card" style="max-width:460px;width:100%;margin:0 auto;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
            <button onclick="navigate('/')" class="btn btn-ghost btn-sm" style="padding:0;gap:6px;">← Home</button>
            <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="navigate('/')">
              <img src="/logo.jpg" alt="Sahayak Logo" style="width:40px;height:40px;object-fit:contain;" />
              <span style="font-size:18px;font-weight:900;letter-spacing:-0.03em;">SAHAYAK <span style="color:var(--color-primary);">B2B</span></span>
            </div>
          </div>

          <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:var(--color-brand-100);border-radius:var(--radius-full);margin-bottom:14px;">
            <span>👷</span>
            <span style="font-size:var(--text-xs);font-weight:800;color:var(--color-primary);text-transform:uppercase;letter-spacing:0.06em;">Worker Access</span>
          </div>

          <h1 style="font-size:var(--text-2xl);font-weight:900;letter-spacing:-0.02em;margin-bottom:8px;">Organization Workforce Portal</h1>
          <p style="color:var(--color-text-muted);font-size:var(--text-sm);margin-bottom:20px;">
            Sign in to your organization workspace or join using an invitation code issued by your manager.
          </p>

          <!-- Mode Switcher -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--color-surface-2,#f3f4f6);padding:4px;border-radius:var(--radius-md);margin-bottom:20px;">
            <button type="button" id="tab-worker-signin" class="btn btn-sm ${initialTab === 'signin' ? 'btn-primary' : 'btn-ghost'}">Worker Sign In</button>
            <button type="button" id="tab-worker-join" class="btn btn-sm ${initialTab === 'join' ? 'btn-primary' : 'btn-ghost'}">Join with Invite Code</button>
          </div>

          <div id="worker-error" class="alert alert-danger hidden" style="margin-bottom:16px;" role="alert">
            <span>⚠️</span>
            <span id="worker-error-msg"></span>
          </div>

          <!-- Sign In Form -->
          <form id="worker-signin-form" class="${initialTab === 'signin' ? '' : 'hidden'}">
            <div class="form-group">
              <label class="form-label" for="w-login-email">Work Email</label>
              <input id="w-login-email" type="email" class="input-field" placeholder="employee@company.in" value="${esc(prefillEmail)}" required />
            </div>
            <div class="form-group" style="margin-top:14px;">
              <label class="form-label" for="w-login-password">Password</label>
              <input id="w-login-password" type="password" class="input-field" placeholder="••••••••" required />
            </div>
            <button type="submit" id="btn-w-signin" class="btn btn-primary btn-full btn-lg" style="margin-top:20px;">
              Sign In to Worker Workspace →
            </button>
          </form>

          <!-- Invite-Only Join Form -->
          <form id="worker-join-form" class="${initialTab === 'join' ? '' : 'hidden'}">
            <div class="alert alert-info" style="margin-bottom:16px;font-size:var(--text-xs);">
              <span>ℹ️</span>
              <div>Workers must join an existing organization using an invite code from their Business Owner or Manager.</div>
            </div>
            <div class="form-group">
              <label class="form-label" for="w-invite-code">Organization Invitation Code *</label>
              <input id="w-invite-code" type="text" class="input-field" placeholder="SHK-XXXXXXXXXX" value="${esc(prefillCode)}" required style="text-transform:uppercase;font-family:monospace;font-weight:700;" />
            </div>
            <div class="form-group" style="margin-top:12px;">
              <label class="form-label" for="w-join-email">Invited Email Address *</label>
              <input id="w-join-email" type="email" class="input-field" placeholder="employee@company.in" value="${esc(prefillEmail)}" required />
            </div>
            <div class="form-group" style="margin-top:12px;">
              <label class="form-label" for="w-join-phone">Phone Number (optional)</label>
              <input id="w-join-phone" type="tel" class="input-field" placeholder="9876543210" />
            </div>
            <div class="form-group" style="margin-top:12px;">
              <label class="form-label" for="w-join-password">Create Password (min 8 chars) *</label>
              <input id="w-join-password" type="password" class="input-field" placeholder="••••••••" minlength="8" required />
            </div>
            <button type="submit" id="btn-w-join" class="btn btn-primary btn-full btn-lg" style="margin-top:20px;">
              Join Organization →
            </button>
          </form>

          <div style="margin-top:24px;padding-top:18px;border-top:1px solid var(--color-border);text-align:center;font-size:var(--text-xs);color:var(--color-text-muted);">
            Looking for Business Owner, Partner, or Admin access?
            <a href="#/login" style="color:var(--color-primary);font-weight:700;margin-left:4px;">Business / Partner Sign In</a>
          </div>
        </div>
      </section>

      <section class="auth-panel-right gradient-animate" aria-hidden="true">
        <div style="text-align:center;color:white;padding:40px;max-width:400px;">
          <div style="font-size:64px;margin-bottom:20px;">👷‍♂️</div>
          <h2 style="font-size:var(--text-3xl);font-weight:900;margin-bottom:14px;">Organization-Bound<br/>Workforce Access</h2>
          <p style="color:rgba(255,255,255,0.85);line-height:1.7;">
            Role-scoped workspaces for Managers, Procurement, Sales, Warehouse, Manufacturing, Accounts, and Logistics Drivers.
          </p>
          <div style="margin-top:32px;display:flex;flex-direction:column;gap:10px;text-align:left;">
            ${[
              'Strictly isolated to your assigned organization',
              'Permissions controlled by your Business Owner / Manager',
              'Tasks, attendance, leave & daily operational workflows',
              'Full audit trail for every delegated approval'
            ].map((item) => `
              <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.12);padding:10px 14px;border-radius:var(--radius-md);font-size:var(--text-sm);">
                <span>✓</span><span>${item}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    </div>
  `;

  const tabSignIn = container.querySelector('#tab-worker-signin');
  const tabJoin = container.querySelector('#tab-worker-join');
  const formSignIn = container.querySelector('#worker-signin-form');
  const formJoin = container.querySelector('#worker-join-form');
  const errBox = container.querySelector('#worker-error');
  const errMsg = container.querySelector('#worker-error-msg');

  function showErr(msg) {
    errMsg.textContent = msg;
    errBox.classList.remove('hidden');
  }
  function hideErr() {
    errBox.classList.add('hidden');
  }

  tabSignIn.addEventListener('click', () => {
    hideErr();
    tabSignIn.className = 'btn btn-sm btn-primary';
    tabJoin.className = 'btn btn-sm btn-ghost';
    formSignIn.classList.remove('hidden');
    formJoin.classList.add('hidden');
  });

  tabJoin.addEventListener('click', () => {
    hideErr();
    tabJoin.className = 'btn btn-sm btn-primary';
    tabSignIn.className = 'btn btn-sm btn-ghost';
    formJoin.classList.remove('hidden');
    formSignIn.classList.add('hidden');
  });

  formSignIn.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErr();
    const btn = container.querySelector('#btn-w-signin');
    btn.disabled = true;
    try {
      const user = await api.workerLogin(
        container.querySelector('#w-login-email').value.trim(),
        container.querySelector('#w-login-password').value
      );
      persistUser(user);
      setState({ user, demoMode: false, sessionChecked: true });
      showToast(`Welcome, ${user.fullName}!`, 'success');
      navigate('/dashboard');
    } catch (err) {
      showErr(err.message || 'Worker sign-in failed.');
    } finally {
      btn.disabled = false;
    }
  });

  formJoin.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErr();
    const btn = container.querySelector('#btn-w-join');
    btn.disabled = true;
    try {
      const user = await api.workerJoin({
        inviteCode: container.querySelector('#w-invite-code').value.trim(),
        email: container.querySelector('#w-join-email').value.trim(),
        phone: container.querySelector('#w-join-phone').value.trim(),
        password: container.querySelector('#w-join-password').value
      });
      persistUser(user);
      setState({ user, demoMode: false, sessionChecked: true });
      showToast(`Joined ${user.organization?.name || 'organization'} successfully!`, 'success');
      navigate('/dashboard');
    } catch (err) {
      showErr(err.message || 'Unable to join organization with this invitation code.');
    } finally {
      btn.disabled = false;
    }
  });
}
