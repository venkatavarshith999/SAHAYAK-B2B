/**
 * SAHAYAK B2B — Phase D Module 1: Reusable Partnerships & Relationship Management Panel
 * Works across Buyer, Seller, Logistics, and Worker Manager workspaces.
 */

import { api } from '../api.js';
import { store } from '../store.js';
import { showToast } from './toast.js';
import { esc, fmtDate } from '../utils/sanitize.js';

const REL_TYPES = [
  ['RETAILER_WHOLESALER', 'Retailer ↔ Wholesaler'],
  ['RETAILER_MANUFACTURER', 'Retailer ↔ Manufacturer'],
  ['WHOLESALER_MANUFACTURER', 'Wholesaler ↔ Manufacturer'],
  ['DISTRIBUTOR_MANUFACTURER', 'Distributor ↔ Manufacturer'],
  ['LOGISTICS_PARTNERSHIP', 'Logistics Partnership']
];

let discoverQuery = '';

export async function renderPartnershipsPanel(onRefresh, { onOpenChat = null } = {}) {
  const [{ sent = [], received = [], active = [] }, { organizations = [] }] = await Promise.all([
    api.getPartnerships(),
    api.discoverPartners(discoverQuery ? { search: discoverQuery } : {})
  ]);

  const mem = store.user?.membership;
  const canApprove = Boolean(mem?.isOwner || (mem?.permissions || []).includes('APPROVE_PARTNERSHIPS'));
  const canReview = Boolean(canApprove || (mem?.permissions || []).includes('REVIEW_PARTNERSHIPS'));

  window.__searchPartners = (e) => {
    e.preventDefault();
    discoverQuery = document.getElementById('pt-search')?.value.trim() || '';
    onRefresh();
  };

  window.__sendPartnership = async (e) => {
    e.preventDefault();
    try {
      await api.createPartnership({
        targetOrgId: document.getElementById('pt-target')?.value,
        relationshipType: document.getElementById('pt-type')?.value,
        message: document.getElementById('pt-msg')?.value.trim() || '',
        commercialTerms: document.getElementById('pt-terms')?.value.trim() || ''
      });
      showToast('Partnership request sent!', 'success');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Could not submit request.', 'error');
    }
  };

  window.__reviewPartnership = async (id, action) => {
    const prompts = {
      REQUEST_INFO: 'What additional documents or details do you need from the applicant?',
      RECOMMEND_APPROVE: 'Manager recommendation notes for the owner:',
      ESCALATE_TO_OWNER: 'Escalation notes for the business owner:',
      APPROVE: 'Approval notes (optional):',
      REJECT: 'Reason for rejection:'
    };
    const notes = window.prompt(prompts[action] || 'Notes:');
    if (notes === null) return;
    try {
      await api.reviewPartnership(id, action, notes);
      showToast(`Partnership updated (${action.replace(/_/g, ' ')})`, 'success');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Review action failed.', 'error');
    }
  };

  window.__respondPartnership = async (id) => {
    const response = window.prompt('Provide the requested additional information:');
    if (!response) return;
    try {
      await api.respondPartnership(id, response);
      showToast('Additional information sent!', 'success');
      onRefresh();
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.__chatWithPartner = async (targetOrgId) => {
    try {
      const { conversation } = await api.openB2bConversation(targetOrgId);
      window.__activeChatConvId = conversation.id;
      if (onOpenChat) onOpenChat();
      else window.__sidebarNav?.('chat');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const badgeCls = (st) => st === 'APPROVED' ? 'badge-active' : st === 'REJECTED' || st === 'SUSPENDED' ? 'badge-rejected' : 'badge-pending';

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header">
        <h1>🤝 Business Partnerships</h1>
        <p>Connect verified Retailers, Wholesalers, Manufacturers, Distributors, and Logistics companies with manager review & owner approval.</p>
      </div>

      <!-- Submit New Partnership Request -->
      <div class="card-soft p-6">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
          <h3 style="font-weight:700;">+ Request New Business Partnership</h3>
          <form onsubmit="window.__searchPartners(event)" style="display:flex;gap:6px;">
            <input id="pt-search" class="input-field" placeholder="Filter organizations…" value="${esc(discoverQuery)}" style="width:180px;" />
            <button type="submit" class="btn btn-ghost btn-sm">Find</button>
          </form>
        </div>

        ${organizations.length ? `
          <form onsubmit="window.__sendPartnership(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;align-items:end;">
            <div>
              <label class="form-label">Target Verified Organization *</label>
              <select id="pt-target" class="input-field select-field" required>
                ${organizations.map((o) => `<option value="${esc(o.id)}">${esc(o.name)} (${esc(o.businessType)} · ${esc(o.city)})</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="form-label">Relationship Type *</label>
              <select id="pt-type" class="input-field select-field" required>
                ${REL_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}
              </select>
            </div>
            <div><label class="form-label">Message / Introduction</label><input id="pt-msg" class="input-field" placeholder="Monthly volume & regions" /></div>
            <div><label class="form-label">Commercial Terms</label><input id="pt-terms" class="input-field" placeholder="e.g. Net 30, min 500 units/mo" /></div>
            <button type="submit" class="btn btn-primary">Send Request</button>
          </form>
        ` : `<p style="color:var(--color-text-muted);font-size:var(--text-sm);">No other active verified organizations available to partner with yet.</p>`}
      </div>

      <!-- Incoming Partnership Requests (Manager Review + Owner Decision) -->
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:12px;">📥 Incoming Partnership Requests (${received.length})</h3>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead><tr><th>Applicant Organization</th><th>Relationship</th><th>Profile & Notes</th><th>Status</th><th>Review Actions</th></tr></thead>
            <tbody>
              ${received.map((p) => `
                <tr>
                  <td>
                    <strong>${esc(p.requesterOrg?.name)}</strong>
                    <div style="font-size:11px;color:var(--color-text-muted);">${esc(p.requesterOrg?.businessType)} · ${esc(p.requesterOrg?.city)} ${p.requesterOrg?.gstVerified ? '· ✓ GST' : ''}</div>
                    <div style="font-size:11px;color:var(--color-text-muted);">${esc(p.requesterOrg?._count?.documents ?? 0)} docs on file</div>
                  </td>
                  <td><span class="badge badge-brand">${esc(p.relationshipType.replace(/_/g, ' '))}</span></td>
                  <td style="font-size:var(--text-xs);max-width:240px;">
                    ${esc(p.message || '—')}
                    ${p.commercialTerms ? `<div style="color:var(--color-primary);margin-top:2px;">Terms: ${esc(p.commercialTerms)}</div>` : ''}
                    ${p.reviewerNotes ? `<div style="color:var(--color-text-muted);margin-top:2px;">Review: ${esc(p.reviewerNotes)}</div>` : ''}
                  </td>
                  <td><span class="badge ${badgeCls(p.status)}">${esc(p.status.replace(/_/g, ' '))}</span></td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      ${canReview && !['APPROVED', 'REJECTED'].includes(p.status) ? `
                        <button class="btn btn-ghost btn-sm" onclick="window.__reviewPartnership('${esc(p.id)}','REQUEST_INFO')">❓ Info</button>
                        ${!canApprove ? `<button class="btn btn-ghost btn-sm" onclick="window.__reviewPartnership('${esc(p.id)}','RECOMMEND_APPROVE')">👍 Recommend</button>
                        <button class="btn btn-ghost btn-sm" onclick="window.__reviewPartnership('${esc(p.id)}','ESCALATE_TO_OWNER')">⬆️ Escalate</button>` : ''}
                      ` : ''}
                      ${canApprove && !['APPROVED', 'REJECTED'].includes(p.status) ? `
                        <button class="btn btn-sm" style="background:var(--color-success-bg);color:var(--color-success);" onclick="window.__reviewPartnership('${esc(p.id)}','APPROVE')">✓ Approve</button>
                        <button class="btn btn-danger btn-sm" onclick="window.__reviewPartnership('${esc(p.id)}','REJECT')">✗ Reject</button>
                      ` : ''}
                      <button class="btn btn-ghost btn-sm" onclick="window.__chatWithPartner('${esc(p.requesterOrgId)}')">💬 Chat</button>
                    </div>
                  </td>
                </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);">No incoming partnership requests yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sent & Active Partnerships -->
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:12px;">📤 Outgoing Requests (${sent.length}) · ✅ Active Partnerships (${active.length})</h3>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead><tr><th>Partner Organization</th><th>Relationship</th><th>Status</th><th>Updated</th><th>Action</th></tr></thead>
            <tbody>
              ${sent.map((p) => `
                <tr>
                  <td><strong>${esc(p.targetOrg?.name)}</strong><div style="font-size:11px;color:var(--color-text-muted);">${esc(p.targetOrg?.businessType)} · ${esc(p.targetOrg?.city)}</div></td>
                  <td><span class="badge badge-brand">${esc(p.relationshipType.replace(/_/g, ' '))}</span></td>
                  <td>
                    <span class="badge ${badgeCls(p.status)}">${esc(p.status.replace(/_/g, ' '))}</span>
                    ${p.requestedInfoNote ? `<div style="font-size:11px;color:var(--color-warning);margin-top:2px;">Requested: ${esc(p.requestedInfoNote)}</div>` : ''}
                  </td>
                  <td style="font-size:var(--text-xs);">${esc(fmtDate(p.updatedAt))}</td>
                  <td>
                    <div style="display:flex;gap:6px;">
                      ${p.status === 'INFO_REQUESTED' ? `<button class="btn btn-primary btn-sm" onclick="window.__respondPartnership('${esc(p.id)}')">Provide Info</button>` : ''}
                      <button class="btn btn-ghost btn-sm" onclick="window.__chatWithPartner('${esc(p.targetOrgId)}')">💬 Chat</button>
                    </div>
                  </td>
                </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);">No outgoing partnership requests sent yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}
