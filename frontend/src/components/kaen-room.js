/**
 * SAHAYAK B2B — KAEN Multi-Round Negotiation Room
 * Preserves the existing backend negotiation engine logic
 */

import { api, demoData } from '../api.js';
import { store } from '../store.js';
import { showToast } from './toast.js';

export class KaenRoom {
  constructor(container) {
    this.container = container;
    this.session = JSON.parse(JSON.stringify(demoData.kaenSession)); // Clone demo data
    this.render();
  }

  getStatusClass(status) {
    return { ACCEPTED: 'badge-active', COUNTER_OFFER: 'badge-brand', ESCALATED_TO_HUMAN: 'badge-pending' }[status] || 'badge-muted';
  }

  getGapPct() {
    const { buyerOffer, sellerAsk } = this.session;
    return sellerAsk > 0 ? Math.round(((sellerAsk - buyerOffer) / sellerAsk) * 100) : 0;
  }

  progressWidth() {
    return Math.min((this.session.round / this.session.maxRounds) * 100, 100);
  }

  render() {
    const s = this.session;
    const gap = this.getGapPct();
    const totalBuyer = (s.buyerOffer * s.quantity).toLocaleString('en-IN');
    const totalSeller = (s.sellerAsk * s.quantity).toLocaleString('en-IN');
    const potentialSaving = ((s.sellerAsk - s.buyerOffer) * s.quantity).toLocaleString('en-IN');

    this.container.innerHTML = `
      <div style="max-width:900px;" class="animate-fadeInUp">
        <!-- Header -->
        <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
          <div>
            <h1 style="font-size:var(--text-2xl);font-weight:800;letter-spacing:-0.02em;">
              🤝 KAEN Negotiation Room
            </h1>
            <p style="color:var(--color-text-muted);font-size:var(--text-sm);">
              AI-Powered Multi-Round Price Negotiation Engine
            </p>
          </div>
          <span class="badge badge-brand" style="font-size:var(--text-sm);padding:6px 16px;">
            Round ${s.round} / ${s.maxRounds}
          </span>
        </div>

        <!-- Product Info -->
        <div class="card-soft p-5 mb-4">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
              <div class="metric-label">Negotiating For</div>
              <div style="font-weight:700;font-size:var(--text-base);margin-top:4px;">${s.product}</div>
            </div>
            <div style="display:flex;gap:24px;flex-wrap:wrap;">
              <div style="text-align:center;">
                <div class="metric-label">Quantity</div>
                <div style="font-weight:800;font-size:var(--text-xl);">${s.quantity.toLocaleString()}</div>
                <div style="font-size:var(--text-xs);color:var(--color-text-muted);">Units</div>
              </div>
              <div style="text-align:center;">
                <div class="metric-label">Price Gap</div>
                <div style="font-weight:800;font-size:var(--text-xl);color:var(--color-warning);">${gap}%</div>
                <div style="font-size:var(--text-xs);color:var(--color-text-muted);">to close</div>
              </div>
              <div style="text-align:center;">
                <div class="metric-label">Potential Saving</div>
                <div style="font-weight:800;font-size:var(--text-xl);color:var(--color-success);">₹${potentialSaving}</div>
                <div style="font-size:var(--text-xs);color:var(--color-text-muted);">if accepted</div>
              </div>
            </div>
          </div>

          <!-- Progress -->
          <div style="margin-top:16px;">
            <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);color:var(--color-text-muted);margin-bottom:8px;">
              <span>Round Progress</span>
              <span>${s.round}/${s.maxRounds} rounds used</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${this.progressWidth()}%"></div>
            </div>
          </div>
        </div>

        <!-- Current Offers -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
          <div class="card" style="border:2px solid var(--color-brand-200);background:var(--color-brand-50);">
            <div class="metric-label" style="color:var(--color-primary);">Your Offer (Buyer)</div>
            <div class="metric-value brand" style="font-size:var(--text-4xl);">₹${s.buyerOffer}</div>
            <div style="font-size:var(--text-xs);color:var(--color-text-muted);">per unit • Total ₹${totalBuyer}</div>
          </div>
          <div class="card" style="border:2px solid #FDE68A;background:#FFFBEB;">
            <div class="metric-label" style="color:var(--color-warning);">Seller Ask</div>
            <div class="metric-value" style="color:var(--color-warning);font-size:var(--text-4xl);">₹${s.sellerAsk}</div>
            <div style="font-size:var(--text-xs);color:var(--color-text-muted);">per unit • Total ₹${totalSeller}</div>
          </div>
        </div>

        <!-- Submit Counter Offer -->
        <div class="card-soft p-6 mb-4">
          <h3 style="font-weight:700;margin-bottom:16px;">Submit Counter-Offer (Round ${s.round + 1})</h3>
          <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
              <label class="form-label">Your Counter Price (₹/unit)</label>
              <div class="input-group">
                <span class="input-icon" style="left:14px;">₹</span>
                <input
                  id="kaen-offer-input"
                  type="number"
                  class="input-field"
                  style="padding-left:32px;"
                  value="${Math.round((s.buyerOffer + s.sellerAsk) / 2)}"
                  min="${s.buyerOffer}"
                  max="${s.sellerAsk}"
                  step="0.5"
                />
              </div>
              <div class="form-hint">Range: ₹${s.buyerOffer} – ₹${s.sellerAsk}</div>
            </div>
            <button class="btn btn-primary btn-lg" onclick="window.__kaenSubmit()" style="white-space:nowrap;">
              🤝 Submit KAEN Round ${s.round + 1}
            </button>
            ${s.round >= 2 ? `
              <button class="btn btn-ghost" onclick="window.__kaenAccept()" style="border-color:var(--color-success);color:var(--color-success);">
                ✅ Accept ₹${s.sellerAsk}
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Negotiation History -->
        <div class="card-soft p-6">
          <h3 style="font-weight:700;margin-bottom:16px;">📊 Negotiation History</h3>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Buyer Offer</th>
                  <th>Seller Counter</th>
                  <th>Gap</th>
                  <th>Status</th>
                  <th>KAEN Note</th>
                </tr>
              </thead>
              <tbody>
                ${s.history.map(h => {
                  const roundGap = h.seller > 0 ? Math.round(((h.seller - h.buyer) / h.seller) * 100) : 0;
                  return `
                    <tr>
                      <td><strong>Round ${h.round}</strong></td>
                      <td>₹${h.buyer}/unit</td>
                      <td>₹${h.seller}/unit</td>
                      <td style="color:${roundGap < 5 ? 'var(--color-success)' : 'var(--color-warning)'};">${roundGap}%</td>
                      <td><span class="badge ${this.getStatusClass(h.status)}">${h.status?.replace('_', ' ') || 'ACTIVE'}</span></td>
                      <td style="color:var(--color-text-muted);font-size:var(--text-xs);">${h.note}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- KAEN Info -->
        <div class="alert alert-info" style="margin-top:16px;">
          <span>ℹ️</span>
          <div>
            <strong>About KAEN Engine:</strong> The KAEN (Kinetic Automated Exchange Negotiator) uses a concession-curve algorithm to calculate optimal counter-offers within seller floor price constraints. Each round moves toward an agreed price using a 1.35-power concession factor.
          </div>
        </div>
      </div>
    `;

    // Bind events
    window.__kaenSubmit = () => this.submitRound();
    window.__kaenAccept = () => this.acceptDeal();
  }

  async submitRound() {
    const input = document.getElementById('kaen-offer-input');
    const buyerOffer = parseFloat(input?.value || 0);

    if (!buyerOffer || buyerOffer < this.session.buyerOffer) {
      showToast('Offer must be higher than your previous offer', 'warning');
      return;
    }

    const btn = document.querySelector('[onclick="window.__kaenSubmit()"]');
    if (btn) { btn.classList.add('btn-loading'); btn.disabled = true; }

    try {
      // Call real KAEN backend engine
      const result = await api.negotiate({
        round: this.session.round + 1,
        maxRounds: this.session.maxRounds,
        buyerOffer,
        buyerMaxPrice: this.session.buyerMax,
        sellerAsk: this.session.sellerAsk,
        sellerFloorPrice: this.session.sellerFloor,
        quantity: this.session.quantity
      });

      this.session.round += 1;
      this.session.buyerOffer = buyerOffer;

      if (result.status === 'ACCEPTED') {
        this.session.sellerAsk = buyerOffer;
        this.session.history.push({
          round: this.session.round,
          buyer: buyerOffer,
          seller: buyerOffer,
          note: result.rationale,
          status: 'ACCEPTED'
        });
        showToast(`🎉 Deal agreed at ₹${buyerOffer}/unit! Total: ₹${result.totalValue.toLocaleString('en-IN')}`, 'success', 6000);
      } else if (result.status === 'ESCALATED_TO_HUMAN') {
        this.session.history.push({
          round: this.session.round,
          buyer: buyerOffer,
          seller: this.session.sellerAsk,
          note: `Escalated — suggested midpoint: ₹${result.suggestedMidpoint}`,
          status: 'ESCALATED_TO_HUMAN'
        });
        showToast(`⚠️ Negotiation escalated to manual review. Suggested: ₹${result.suggestedMidpoint}/unit`, 'warning', 6000);
      } else {
        this.session.sellerAsk = result.counterUnitPrice;
        this.session.history.push({
          round: this.session.round,
          buyer: buyerOffer,
          seller: result.counterUnitPrice,
          note: result.rationale,
          status: 'COUNTER_OFFER'
        });
        showToast(`Counter-offer: Seller moved to ₹${result.counterUnitPrice}/unit (↓${result.buyerDeltaPct}% gap)`, 'info');
      }
    } catch (err) {
      if (store.demoMode || err.isServerDown) {
        // Demo mode fallback ONLY when explicitly in demo mode or backend offline
        this.applyLocalKaen(buyerOffer);
      } else {
        showToast(err.message || 'KAEN negotiation request rejected.', 'error', 5000);
      }
    }

    if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
    this.render();
  }

  applyLocalKaen(buyerOffer) {
    const s = this.session;
    s.round += 1;
    s.buyerOffer = buyerOffer;
    const progress = Math.min(s.round / s.maxRounds, 1);
    const concessionFactor = Math.pow(progress, 1.35);
    const nextSellerCounter = Math.round((s.sellerAsk - (s.sellerAsk - s.sellerFloor) * concessionFactor) * 100) / 100;

    if (buyerOffer >= nextSellerCounter) {
      s.sellerAsk = buyerOffer;
      s.history.push({ round: s.round, buyer: buyerOffer, seller: buyerOffer, note: 'KAEN concession threshold met', status: 'ACCEPTED' });
      showToast(`🎉 Deal agreed at ₹${buyerOffer}/unit!`, 'success', 6000);
    } else {
      s.sellerAsk = nextSellerCounter;
      const gap = Math.round(((nextSellerCounter - buyerOffer) / buyerOffer) * 1000) / 10;
      s.history.push({ round: s.round, buyer: buyerOffer, seller: nextSellerCounter, note: `KAEN Round ${s.round}/${s.maxRounds} concession`, status: 'COUNTER_OFFER' });
      showToast(`Counter-offer: ₹${nextSellerCounter}/unit (${gap}% gap remaining)`, 'info');
    }
  }

  acceptDeal() {
    showToast(`✅ Deal accepted at ₹${this.session.sellerAsk}/unit! Total: ₹${(this.session.sellerAsk * this.session.quantity).toLocaleString('en-IN')}`, 'success', 6000);
    this.session.buyerOffer = this.session.sellerAsk;
    this.session.history.push({
      round: this.session.round,
      buyer: this.session.sellerAsk,
      seller: this.session.sellerAsk,
      note: 'Buyer accepted seller ask',
      status: 'ACCEPTED'
    });
    this.render();
  }
}
