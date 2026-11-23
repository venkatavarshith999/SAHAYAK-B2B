/**
 * SAHAYAK B2B — Persistent KAEN Multi-Round Negotiation Center
 * Backed by PostgreSQL (/api/kaen/sessions) and the preserved backend KAEN solver.
 * Requires explicit dual-party confirmation before locking an immutable agreed-terms snapshot.
 */

import { api, demoData } from '../api.js';
import { store } from '../store.js';
import { showToast } from './toast.js';
import { esc, fmtDate } from '../utils/sanitize.js';

export class KaenRoom {
  constructor(container) {
    this.container = container;
    this.sessions = [];
    this.selectedId = window.__selectedKaenSessionId || null;
    this.load();
  }

  async load() {
    if (store.demoMode) {
      this.renderDemo();
      return;
    }
    this.container.innerHTML = `<div class="page-enter"><p style="color:var(--color-text-muted);">Loading KAEN negotiation sessions…</p></div>`;
    try {
      const { sessions = [] } = await api.getKaenSessions();
      this.sessions = sessions;
      if (!this.selectedId && sessions.length > 0) this.selectedId = sessions[0].id;
      this.renderLive();
    } catch (err) {
      this.container.innerHTML = `<div class="alert alert-danger"><span>❌</span><div>${esc(err.message || 'Failed to load KAEN sessions.')}</div></div>`;
    }
  }

  renderLive() {
    const active = this.sessions.find((s) => s.id === this.selectedId) || this.sessions[0] || null;
    if (active) this.selectedId = active.id;

    window.__selectKaenSession = (id) => {
      this.selectedId = id;
      window.__selectedKaenSessionId = id;
      this.renderLive();
    };

    window.__kaenSendOffer = async (e, id) => {
      e.preventDefault();
      try {
        const payload = {
          proposedPrice: Number(document.getElementById('kn-price')?.value),
          proposedQty: Number(document.getElementById('kn-qty')?.value),
          deliveryTerms: document.getElementById('kn-del')?.value.trim() || '',
          paymentTerms: document.getElementById('kn-pay')?.value.trim() || '',
          message: document.getElementById('kn-msg')?.value.trim() || ''
        };
        const floorInput = document.getElementById('kn-floor');
        if (floorInput?.value) payload.sellerFloorPrice = Number(floorInput.value);

        await api.submitKaenOffer(id, payload);
        showToast('Counteroffer evaluated by KAEN & recorded!', 'success');
        await this.load();
      } catch (err) { showToast(err.message || 'Offer submission failed.', 'error'); }
    };

    window.__kaenConfirm = async (id) => {
      try {
        const res = await api.confirmKaenSession(id);
        showToast(res.session?.status === 'AGREED' ? '🎉 Both parties confirmed! Terms locked.' : 'Your confirmation recorded. Waiting for counterparty.', 'success');
        await this.load();
      } catch (err) { showToast(err.message, 'error'); }
    };

    window.__kaenCancel = async (id) => {
      if (!window.confirm('Cancel this negotiation session?')) return;
      try { await api.cancelKaenSession(id); showToast('Negotiation cancelled.', 'info'); await this.load(); }
      catch (err) { showToast(err.message, 'error'); }
    };

    window.__kaenCreateOrder = async (id) => {
      try {
        const res = await api.createOrderFromNegotiation(id);
        showToast(`Order ${res.order?.orderNumber} created from agreed KAEN terms!`, 'success');
        window.__sidebarNav?.('orders');
      } catch (err) { showToast(err.message, 'error'); }
    };

    this.container.innerHTML = `
      <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
        <div class="page-header">
          <h1>🤝 KAEN Persistent Negotiation Center</h1>
          <p>Multi-round B2B price, quantity, delivery & payment-term bargaining powered by KAEN. Both parties must explicitly confirm final terms.</p>
        </div>

        ${!this.sessions.length ? `
          <div class="card-soft p-8 text-center">
            <div style="font-size:44px;margin-bottom:10px;">🤝</div>
            <h3 style="font-weight:800;margin-bottom:6px;">No Active KAEN Negotiations Yet</h3>
            <p style="color:var(--color-text-muted);font-size:var(--text-sm);max-width:460px;margin:0 auto 16px;">
              Start a persistent KAEN negotiation from any submitted quotation under <strong>RFQs & Quotes</strong>.
            </p>
            <button class="btn btn-primary btn-sm" onclick="window.__sidebarNav('rfq')">Go to RFQs & Quotations →</button>
          </div>
        ` : `
          <div style="display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:start;">
            <!-- Sessions Sidebar -->
            <div class="card-soft p-4" style="display:flex;flex-direction:column;gap:8px;">
              <div style="font-size:var(--text-xs);font-weight:800;color:var(--color-text-muted);text-transform:uppercase;">Sessions (${this.sessions.length})</div>
              ${this.sessions.map((s) => `
                <button onclick="window.__selectKaenSession('${esc(s.id)}')" style="text-align:left;padding:12px;border-radius:var(--radius-md);border:1px solid ${active?.id === s.id ? 'var(--color-primary)' : 'var(--color-border)'};background:${active?.id === s.id ? 'var(--color-brand-50,#f5f3ff)' : '#fff'};cursor:pointer;">
                  <div style="font-weight:700;font-size:var(--text-sm);">${esc(s.productName)}</div>
                  <div style="font-size:11px;color:var(--color-text-muted);">${esc(s.mySide === 'BUYER' ? s.sellerOrg?.name : s.buyerOrg?.name)}</div>
                  <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;">
                    <span class="badge ${s.status === 'AGREED' ? 'badge-active' : s.status === 'CANCELLED' ? 'badge-rejected' : 'badge-brand'}" style="font-size:10px;">${esc(s.status)}</span>
                    <span style="font-size:11px;color:var(--color-text-muted);">R${esc(s.round)}/${esc(s.maxRounds)}</span>
                  </div>
                </button>`).join('')}
            </div>

            <!-- Active Session Workspace -->
            ${active ? this.renderSessionDetail(active) : ''}
          </div>
        `}
      </div>`;
  }

  renderSessionDetail(s) {
    const isBuyer = s.mySide === 'BUYER';
    const closed = ['AGREED', 'CANCELLED', 'EXPIRED'].includes(s.status);
    const myConfirmed = isBuyer ? s.buyerConfirmed : s.sellerConfirmed;

    return `
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0;">
        <div class="card-soft p-6">
          <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:10px;">
            <div>
              <span class="badge badge-brand">Round ${esc(s.round)} / ${esc(s.maxRounds)}</span>
              <span class="badge ${s.status === 'AGREED' ? 'badge-active' : s.status === 'CANCELLED' ? 'badge-rejected' : 'badge-pending'}" style="margin-left:6px;">${esc(s.status.replace(/_/g, ' '))}</span>
              <h2 style="font-size:var(--text-xl);font-weight:900;margin-top:8px;">${esc(s.productName)} (${esc(s.quantity)} ${esc(s.unit)})</h2>
              <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:4px;">
                Buyer: <strong>${esc(s.buyerOrg?.name)}</strong> · Seller: <strong>${esc(s.sellerOrg?.name)}</strong>
                ${s.paymentTerms ? ` · Terms: ${esc(s.paymentTerms)}` : ''}
              </div>
            </div>
            ${!closed ? `<button class="btn btn-danger btn-sm" onclick="window.__kaenCancel('${esc(s.id)}')">Cancel</button>` : ''}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;">
            <div style="padding:14px;border-radius:var(--radius-md);background:var(--color-brand-50,#f5f3ff);border:1px solid var(--color-brand-200,#ddd6fe);">
              <div style="font-size:11px;font-weight:700;color:var(--color-primary);">BUYER OFFER</div>
              <div style="font-size:var(--text-2xl);font-weight:900;color:var(--color-primary);">₹${esc(s.currentBuyerOffer)}/${esc(s.unit)}</div>
              <div style="font-size:11px;color:var(--color-text-muted);">Buyer Confirmed: ${s.buyerConfirmed ? '✅ Yes' : '⏳ Pending'}</div>
            </div>
            <div style="padding:14px;border-radius:var(--radius-md);background:#fffbeb;border:1px solid #fde68a;">
              <div style="font-size:11px;font-weight:700;color:var(--color-warning);">SELLER ASK (KAEN)</div>
              <div style="font-size:var(--text-2xl);font-weight:900;color:var(--color-warning);">₹${esc(s.currentSellerAsk)}/${esc(s.unit)}</div>
              <div style="font-size:11px;color:var(--color-text-muted);">Seller Confirmed: ${s.sellerConfirmed ? '✅ Yes' : '⏳ Pending'}${!isBuyer && s.sellerFloorPrice ? ` · Private Floor: ₹${esc(s.sellerFloorPrice)}` : ''}</div>
            </div>
          </div>

          <!-- Dual-Party Confirmation / Immutable Snapshot -->
          ${s.status === 'AGREED' && s.agreedTermsSnapshot ? `
            <div class="alert alert-success" style="margin-top:16px;justify-content:space-between;flex-wrap:wrap;gap:10px;">
              <div>
                <strong>🔒 Immutable Commercial Terms Locked (${esc(fmtDate(s.agreedTermsSnapshot.lockedAt))}):</strong>
                ₹${esc(s.agreedTermsSnapshot.agreedUnitPrice)}/${esc(s.agreedTermsSnapshot.unit)} × ${esc(s.agreedTermsSnapshot.quantity)} =
                <strong>₹${Number(s.agreedTermsSnapshot.agreedTotalValue).toLocaleString('en-IN')}</strong> (before GST/delivery)
              </div>
              ${isBuyer ? `<button class="btn btn-primary btn-sm" onclick="window.__kaenCreateOrder('${esc(s.id)}')">🛒 Create Official Order →</button>` : ''}
            </div>
          ` : !closed ? `
            <div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" onclick="window.__kaenConfirm('${esc(s.id)}')" ${myConfirmed ? 'disabled' : ''}>
                ${myConfirmed ? '✓ You Confirmed — Awaiting Counterparty' : `✓ Confirm Terms at ₹${esc(s.agreedUnitPrice || s.currentSellerAsk)}/${esc(s.unit)}`}
              </button>
              <span style="font-size:11px;color:var(--color-text-muted);">Both buyer and seller must confirm explicitly; AI never auto-finalizes deals.</span>
            </div>
          ` : ''}
        </div>

        <!-- Submit Counteroffer Form -->
        ${!closed ? `
          <div class="card-soft p-6">
            <h3 style="font-weight:700;margin-bottom:12px;">Submit ${isBuyer ? 'Buyer Counteroffer' : 'Seller Counter-Ask'} (Round ${esc(s.round + 1)})</h3>
            <form onsubmit="window.__kaenSendOffer(event, '${esc(s.id)}')" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;">
              <div><label class="form-label">Proposed Price (₹/${esc(s.unit)}) *</label><input id="kn-price" type="number" step="0.01" min="1" class="input-field" value="${esc(Math.round((s.currentBuyerOffer + s.currentSellerAsk) / 2))}" required /></div>
              <div><label class="form-label">Quantity *</label><input id="kn-qty" type="number" min="1" class="input-field" value="${esc(s.quantity)}" required /></div>
              ${!isBuyer ? `<div><label class="form-label">Private Floor (₹)</label><input id="kn-floor" type="number" step="0.01" min="1" class="input-field" value="${esc(s.sellerFloorPrice || '')}" /></div>` : ''}
              <div><label class="form-label">Delivery Terms</label><input id="kn-del" class="input-field" value="${esc(s.deliveryTerms || '')}" placeholder="Ex-works / Door delivery" /></div>
              <div><label class="form-label">Payment Terms</label><input id="kn-pay" class="input-field" value="${esc(s.paymentTerms || 'Net 15 Days')}" /></div>
              <div><label class="form-label">Note / Message</label><input id="kn-msg" class="input-field" placeholder="Optional counteroffer note" /></div>
              <button type="submit" class="btn btn-primary">Submit Round →</button>
            </form>
          </div>
        ` : ''}

        <!-- Round History Table -->
        <div class="card-soft p-6">
          <h3 style="font-weight:700;margin-bottom:12px;">Negotiation Round History</h3>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead><tr><th>Round</th><th>Side</th><th>Proposed</th><th>Qty</th><th>KAEN Outcome</th><th>Rationale / Note</th><th>Time</th></tr></thead>
              <tbody>
                ${(s.rounds || []).map((r) => `
                  <tr>
                    <td><strong>#${esc(r.roundNumber)}</strong></td>
                    <td><span class="badge badge-brand">${esc(r.actorSide)}</span></td>
                    <td>₹${esc(r.proposedPrice)}</td>
                    <td>${esc(r.proposedQty)}</td>
                    <td><span class="badge badge-muted">${esc(r.kaenStatus || '—')}</span>${r.kaenCounterPrice ? ` → ₹${esc(r.kaenCounterPrice)}` : ''}</td>
                    <td style="font-size:11px;color:var(--color-text-muted);">${esc(r.rationale || '')}${r.message ? ` · "${esc(r.message)}"` : ''}</td>
                    <td style="font-size:11px;">${esc(fmtDate(r.createdAt))}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  renderDemo() {
    const s = demoData.kaenSession;
    this.container.innerHTML = `
      <div class="card-soft p-6">
        <span class="badge badge-warning">Demo Mode Preview</span>
        <h2 style="font-weight:800;margin-top:8px;">🤝 KAEN Negotiation Engine (Demo)</h2>
        <p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:6px;">
          Sign in with a verified business account to create persistent multi-round KAEN sessions backed by PostgreSQL.
          Sample: ${esc(s.product)} — Buyer Offer ₹${esc(s.buyerOffer)} vs Seller Ask ₹${esc(s.sellerAsk)}.
        </p>
      </div>`;
  }
}
