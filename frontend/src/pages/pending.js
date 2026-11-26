/**
 * SAHAYAK B2B — Live Verification Status & Supporting Document Upload Page
 * Handles PENDING_VERIFICATION, NEEDS_INFO, ON_HOLD, and INCOMPLETE_PROFILE states.
 */

import { navigate } from '../router.js';
import { api } from '../api.js';
import { store, setState, persistUser, broadcastSessionIdentity } from '../store.js';
import { showToast } from '../components/toast.js';
import { esc, fmtDate } from '../utils/sanitize.js';
import { isAdminRole, resolvePortalDestination } from '../utils/portalResolver.js';

const STATUS_META = {
  PENDING_VERIFICATION: {
    badge: 'Verification Pending',
    badgeClass: 'badge-pending',
    title: 'Business Verification Under Review',
    desc: 'Our Verification Admin team is reviewing your business profile and documents. Verified badges are awarded only after approval.'
  },
  NEEDS_INFO: {
    badge: 'Additional Documents Requested',
    badgeClass: 'badge-warning',
    title: 'Action Required: Additional Information Needed',
    desc: 'A Verification Admin requested additional documentation or clarification before approving your organization.'
  },
  ON_HOLD: {
    badge: 'Verification On Hold',
    badgeClass: 'badge-warning',
    title: 'Verification Temporarily On Hold',
    desc: 'Your compliance review is currently on hold. Please review the notes below or upload supporting documents.'
  },
  INCOMPLETE_PROFILE: {
    badge: 'Incomplete Profile',
    badgeClass: 'badge-pending',
    title: 'Complete Your Business Profile',
    desc: 'Please provide your organization details and verification documents to activate your account.'
  }
};

export default async function renderPending(container) {
  const expectedApplicant =
    store.user && store.user.id && !isAdminRole(store.user.role)
      ? { ...store.user }
      : null;

  let sessionConflict = null;

  // Refresh latest status from backend if not in demo mode
  if (!store.demoMode) {
    try {
      const fresh = await api.me();
      // CRITICAL SESSION ISOLATION: If another account (e.g., Super Admin in Tab 2)
      // replaced the browser's shared HttpOnly session cookie, NEVER morph this
      // applicant tab into that account or redirect into Super Admin Portal.
      if (expectedApplicant && fresh.id !== expectedApplicant.id) {
        sessionConflict = {
          activeEmail: fresh.email,
          activeRole: fresh.role,
          applicantEmail: expectedApplicant.email
        };
      } else {
        persistUser(fresh);
        setState({ user: fresh, sessionChecked: true, demoMode: false });
        const dest = resolvePortalDestination(fresh);
        if (fresh.status === 'ACTIVE') {
          showToast('Your business has been approved! Entering your portal…', 'success');
          navigate(dest.route, true);
          return;
        }
        if (fresh.status === 'REJECTED' || fresh.status === 'SUSPENDED') {
          navigate(dest.route, true);
          return;
        }
      }
    } catch (err) {
      if (err?.status === 401 && !expectedApplicant) {
        persistUser(null);
        setState({ user: null, sessionChecked: true, demoMode: false });
        navigate('/login', true);
        return;
      }
    }
  }

  const user = sessionConflict ? expectedApplicant : (store.user || {});
  const meta = STATUS_META[user.status] || STATUS_META.PENDING_VERIFICATION;
  const bizName = user.organization?.name || user.businessProfile?.businessName || user.fullName || 'Your Business';
  const ver = user.businessProfile?.verification || null;

  let docs = [];
  if (!store.demoMode && !sessionConflict && user.organization?.id) {
    try {
      const res = await api.getOrgDocuments();
      docs = res.documents || [];
    } catch {}
  }

  container.innerHTML = `
    <div style="min-height:100vh;width:100%;background:var(--color-bg,#f8f7fc);display:flex;align-items:center;justify-content:center;padding:32px 16px;">
      <div class="card-soft p-8" style="width:100%;max-width:640px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="/logo.jpg" alt="Sahayak Logo" style="width:36px;height:36px;object-fit:contain;" />
            <span style="font-weight:900;font-size:17px;">SAHAYAK <span style="color:var(--color-primary);">B2B</span></span>
          </div>
          <span class="badge ${meta.badgeClass}">${esc(meta.badge)}</span>
        </div>

        <h1 style="font-size:var(--text-2xl);font-weight:900;margin-bottom:8px;">${esc(meta.title)}</h1>
        <p style="color:var(--color-text-muted);font-size:var(--text-sm);line-height:1.6;margin-bottom:20px;">${esc(meta.desc)}</p>

        ${sessionConflict ? `
          <div class="alert alert-warning" style="margin-bottom:18px;text-align:left;" role="alert">
            <span>🔒</span>
            <div>
              <strong>Different Browser Session Detected</strong>
              <div style="margin-top:4px;">
                This browser is currently authenticated as <strong>${esc(sessionConflict.activeEmail)}</strong> (${esc(String(sessionConflict.activeRole || '').replace(/_/g, ' '))}) from another tab.
                To keep sessions isolated, your applicant view for <strong>${esc(sessionConflict.applicantEmail)}</strong> was not redirected.
                Sign in with your applicant credentials below (or use a separate browser window/profile to keep both sessions active).
              </div>
              <div style="margin-top:10px;">
                <button id="btn-pending-relogin" class="btn btn-primary btn-sm">Sign In as Applicant →</button>
              </div>
            </div>
          </div>
        ` : ''}

        ${ver?.reviewerNotes ? `
          <div class="alert alert-warning" style="margin-bottom:18px;text-align:left;">
            <span>📋</span>
            <div>
              <strong>Reviewer Notes (${esc(fmtDate(ver.reviewedAt))}):</strong>
              <div style="margin-top:4px;">${esc(ver.reviewerNotes)}</div>
            </div>
          </div>
        ` : ''}

        <!-- Distinct Verification Checkpoints -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
          <div style="padding:14px;border-radius:var(--radius-md);border:1px solid var(--color-border);background:#fff;">
            <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;">Email Verification</div>
            <div style="margin-top:6px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <span class="badge ${user.emailVerified ? 'badge-active' : 'badge-pending'}">${user.emailVerified ? '✓ Verified' : 'Unverified'}</span>
              ${!user.emailVerified && !store.demoMode ? `<button id="btn-resend-verify" class="btn btn-ghost btn-sm" style="font-size:11px;">Resend Link</button>` : ''}
            </div>
            <div id="dev-verify-box" style="margin-top:6px;font-size:11px;"></div>
          </div>

          <div style="padding:14px;border-radius:var(--radius-md);border:1px solid var(--color-border);background:#fff;">
            <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;">Business Document Review</div>
            <div style="margin-top:6px;">
              <span class="badge ${meta.badgeClass}">${esc(user.status || 'PENDING_VERIFICATION')}</span>
            </div>
          </div>
        </div>

        <!-- Organization Summary -->
        <div style="padding:14px 16px;border-radius:var(--radius-md);background:var(--color-brand-50,#f5f3ff);border:1px solid var(--color-brand-100,#ede9fe);margin-bottom:20px;font-size:var(--text-sm);">
          <div style="display:flex;justify-content:space-between;padding:4px 0;">
            <span style="color:var(--color-text-muted);">Organization:</span>
            <strong>${esc(bizName)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;">
            <span style="color:var(--color-text-muted);">Account Email:</span>
            <strong>${esc(user.email || '—')}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;">
            <span style="color:var(--color-text-muted);">Business Type:</span>
            <strong>${esc(user.organization?.businessType || user.role || '—')}</strong>
          </div>
        </div>

        <!-- Uploaded Documents + Upload New -->
        ${!store.demoMode ? `
          <div style="padding:16px;border-radius:var(--radius-md);border:1px solid var(--color-border);background:#fff;margin-bottom:20px;">
            <div style="font-weight:700;font-size:var(--text-sm);margin-bottom:10px;">📎 Verification Documents (${docs.length})</div>
            ${docs.length ? `
              <ul style="list-style:none;padding:0;margin:0 0 12px 0;display:flex;flex-direction:column;gap:6px;">
                ${docs.map((d) => `
                  <li style="display:flex;align-items:center;justify-content:space-between;font-size:var(--text-xs);padding:6px 10px;background:var(--color-bg,#f8f7fc);border-radius:6px;">
                    <span><strong>${esc(d.docType)}</strong> · ${esc(d.fileName)}</span>
                    <a href="/api/org/documents/${esc(d.id)}/download" target="_blank" style="color:var(--color-primary);font-weight:700;">View</a>
                  </li>
                `).join('')}
              </ul>
            ` : `<p style="font-size:var(--text-xs);color:var(--color-text-muted);margin-bottom:12px;">No documents uploaded yet. Upload your GST certificate, trade license, or PAN below.</p>`}

            <form id="pending-upload-form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <select id="p-doc-type" class="input-field select-field" style="flex:1;min-width:150px;">
                <option value="GST_CERTIFICATE">GST Certificate</option>
                <option value="TRADE_LICENSE">Trade / Shop License</option>
                <option value="PAN_CARD">Business PAN</option>
                <option value="FACTORY_LICENSE">Factory / MSME License</option>
                <option value="TRANSPORT_PERMIT">Transport Permit</option>
              </select>
              <input id="p-doc-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="input-field" style="flex:1;min-width:180px;padding:7px;" required />
              <button type="submit" id="p-upload-btn" class="btn btn-primary btn-sm">Upload</button>
            </form>
          </div>
        ` : `<div class="alert alert-warning" style="margin-bottom:20px;"><span>⚠️</span><div>Demo mode active — document upload and approval require the live backend.</div></div>`}

        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button id="btn-pending-refresh" class="btn btn-primary" style="flex:1;">↻ Refresh Verification Status</button>
          <button id="btn-pending-signout" class="btn btn-ghost" style="flex:1;">Sign Out</button>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-pending-refresh')?.addEventListener('click', () => {
    renderPending(container);
  });

  container.querySelector('#btn-pending-relogin')?.addEventListener('click', () => {
    const emailParam = user.email ? `&email=${encodeURIComponent(user.email)}` : '';
    navigate(`/login?switch=1${emailParam}`);
  });

  container.querySelector('#btn-pending-signout')?.addEventListener('click', async () => {
    if (!sessionConflict) {
      try { await api.logout(); } catch {}
      broadcastSessionIdentity(null);
    }
    persistUser(null);
    setState({ user: null, demoMode: false });
    navigate('/');
  });

  container.querySelector('#btn-resend-verify')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await api.resendVerification();
      showToast(res.message || 'Verification link generated.', 'success');
      if (res._devEmailVerifyToken) {
        const box = container.querySelector('#dev-verify-box');
        if (box) {
          box.innerHTML = `<a href="#/verify-email?token=${encodeURIComponent(res._devEmailVerifyToken)}" style="color:var(--color-primary);font-weight:700;">Dev link: Verify email now →</a>`;
        }
      }
    } catch (err) {
      showToast(err.message || 'Could not resend verification email.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  container.querySelector('#pending-upload-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = container.querySelector('#p-doc-file');
    const docType = container.querySelector('#p-doc-type')?.value || 'BUSINESS_LICENSE';
    const btn = container.querySelector('#p-upload-btn');
    if (!fileInput?.files?.[0]) return;
    btn.disabled = true;
    try {
      await api.uploadOrgDocument(fileInput.files[0], docType);
      showToast('Verification document uploaded!', 'success');
      renderPending(container);
    } catch (err) {
      showToast(err.message || 'Document upload failed.', 'error');
    } finally {
      btn.disabled = false;
    }
  });
}
