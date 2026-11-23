/**
 * SAHAYAK B2B — Phase D Module 2: RFQs & Side-by-Side Quotation Comparison Panel
 * Supports both Buyer (Create RFQ, Compare Quotes, Accept/Reject, Start KAEN, Convert to Order)
 * and Seller (View Incoming RFQs, Submit Quotation, Revise Quotation).
 */

import { api } from '../api.js';
import { store } from '../store.js';
import { showToast } from './toast.js';
import { esc, fmtDate } from '../utils/sanitize.js';

export async function renderRfqPanel(onRefresh, { mode = 'buyer', onGoKaen = null, onGoOrders = null } = {}) {
  const isSellerMode = mode === 'seller';
  const [{ rfqs = [] }, suppliersRes] = await Promise.all([
    api.getRfqs(isSellerMode ? 'incoming' : 'outgoing'),
    !isSellerMode ? api.discoverPartners({ portalType: 'SELLER' }).catch(() => ({ organizations: [] })) : Promise.resolve({ organizations: [] })
  ]);
  const sellers = suppliersRes.organizations || [];

  window.__createRfq = async (e) => {
    e.preventDefault();
    const targetSel = document.getElementById('rfq-seller')?.value;
    try {
      await api.createRfq({
        title: document.getElementById('rfq-title')?.value.trim(),
        productName: document.getElementById('rfq-prod')?.value.trim(),
        category: document.getElementById('rfq-cat')?.value.trim(),
        quantity: Number(document.getElementById('rfq-qty')?.value),
        unit: document.getElementById('rfq-unit')?.value.trim() || 'units',
        targetMaxPrice: document.getElementById('rfq-max')?.value ? Number(document.getElementById('rfq-max')?.value) : null,
        deliveryCity: document.getElementById('rfq-city')?.value.trim(),
        paymentPreference: document.getElementById('rfq-pay')?.value.trim() || '',
        specifications: document.getElementById('rfq-spec')?.value.trim() || '',
        targetSellerOrgIds: targetSel ? [targetSel] : []
      });
      showToast('RFQ published and matching sellers notified!', 'success');
      onRefresh();
    } catch (err) { showToast(err.message || 'Failed to create RFQ.', 'error'); }
  };

  window.__submitQuote = async (e, rfqId) => {
    e.preventDefault();
    try {
      await api.submitQuotation(rfqId, {
        availableQty: Number(document.getElementById(`q-qty-${rfqId}`)?.value),
        unitPrice: Number(document.getElementById(`q-price-${rfqId}`)?.value),
        bulkPrice: document.getElementById(`q-bprice-${rfqId}`)?.value ? Number(document.getElementById(`q-bprice-${rfqId}`)?.value) : null,
        moq: Number(document.getElementById(`q-moq-${rfqId}`)?.value || 1),
        taxRatePct: Number(document.getElementById(`q-tax-${rfqId}`)?.value ?? 18),
        deliveryCharge: Number(document.getElementById(`q-del-${rfqId}`)?.value || 0),
        estimatedDeliveryDays: Number(document.getElementById(`q-days-${rfqId}`)?.value || 7),
        paymentTerms: document.getElementById(`q-pay-${rfqId}`)?.value.trim() || 'Net 15 Days'
      });
      showToast('Quotation submitted to buyer!', 'success');
      onRefresh();
    } catch (err) { showToast(err.message || 'Failed to submit quotation.', 'error'); }
  };

  window.__reviseQuote = async (quoteId, currentPrice) => {
    const next = window.prompt('Enter revised unit price (₹):', String(currentPrice));
    if (next === null) return;
    const unitPrice = Number(next);
    if (!unitPrice || unitPrice <= 0) return showToast('Enter a valid price.', 'warning');
    try {
      await api.reviseQuotation(quoteId, { unitPrice });
      showToast('Quotation revised and buyer notified!', 'success');
      onRefresh();
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.__acceptQuote = async (quoteId) => {
    try {
      await api.acceptQuotation(quoteId);
      showToast('Quotation accepted! You can now convert it to an Order.', 'success');
      onRefresh();
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.__rejectQuote = async (quoteId) => {
    const reason = window.prompt('Optional reason for declining this quotation:');
    if (reason === null) return;
    try {
      await api.rejectQuotation(quoteId, reason);
      showToast('Quotation declined.', 'info');
      onRefresh();
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.__convertQuoteToOrder = async (quoteId) => {
    try {
      const res = await api.createOrderFromQuotation(quoteId);
      showToast(`Order ${res.order?.orderNumber} created!`, 'success');
      if (onGoOrders) onGoOrders();
      else window.__sidebarNav?.('orders');
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.__startKaenFromQuote = async (quoteId, quotedPrice) => {
    const offerStr = window.prompt(`Enter your opening KAEN counteroffer price (₹/unit, quoted ₹${quotedPrice}):`, String(Math.round(quotedPrice * 0.92)));
    if (!offerStr) return;
    const buyerOffer = Number(offerStr);
    if (!buyerOffer || buyerOffer <= 0) return showToast('Enter a valid offer price.', 'warning');
    try {
      const res = await api.startKaenSession({ quotationId: quoteId, buyerOffer });
      window.__selectedKaenSessionId = res.session?.id;
      showToast('KAEN negotiation session started!', 'success');
      if (onGoKaen) onGoKaen();
      else window.__sidebarNav?.('kaen');
    } catch (err) { showToast(err.message, 'error'); }
  };

  if (isSellerMode) {
    return `
      <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
        <div class="page-header"><h1>📋 Incoming Buyer RFQs & Quotations</h1><p>Respond to buyer RFQs with transparent pricing, GST, delivery charges, and payment terms. Competing quotes are strictly private.</p></div>
        ${rfqs.length ? rfqs.map((r) => {
          const myQuote = (r.quotations || [])[0] || null;
          return `
            <div class="card-soft p-6" style="display:flex;flex-direction:column;gap:14px;">
              <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:10px;">
                <div>
                  <span class="badge badge-brand">${esc(r.rfqNumber)}</span>
                  <span class="badge badge-muted" style="margin-left:6px;">${esc(r.status)}</span>
                  <h3 style="font-weight:800;margin-top:8px;">${esc(r.title)} — ${esc(r.productName)}</h3>
                  <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:4px;">
                    Buyer: <strong>${esc(r.buyerOrg?.name)}</strong> (${esc(r.buyerOrg?.city)}) · Qty: <strong>${esc(r.quantity)} ${esc(r.unit)}</strong> · Deliver to: <strong>${esc(r.deliveryCity)}</strong>
                    ${r.targetMaxPrice ? ` · Target Max: ₹${esc(r.targetMaxPrice)}/${esc(r.unit)}` : ''}
                  </div>
                  ${r.specifications ? `<p style="font-size:var(--text-xs);margin-top:6px;">Specs: ${esc(r.specifications)}</p>` : ''}
                </div>
              </div>

              ${myQuote ? `
                <div style="padding:14px;border-radius:var(--radius-md);background:var(--color-brand-50,#f5f3ff);border:1px solid var(--color-brand-200,#ddd6fe);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                  <div style="font-size:var(--text-sm);">
                    <strong>Your Quote ${esc(myQuote.quoteNumber)} (Rev ${esc(myQuote.revision)}):</strong>
                    ₹${esc(myQuote.unitPrice)}/${esc(r.unit)} · GST ${esc(myQuote.taxRatePct)}% · Delivery ₹${esc(myQuote.deliveryCharge)} ·
                    <strong>Total ₹${Number(myQuote.totalAmount).toLocaleString('en-IN')}</strong> ·
                    <span class="badge ${myQuote.status === 'ACCEPTED' ? 'badge-active' : myQuote.status === 'REJECTED' ? 'badge-rejected' : 'badge-pending'}">${esc(myQuote.status)}</span>
                  </div>
                  ${['SUBMITTED', 'REVISED'].includes(myQuote.status) ? `<button class="btn btn-ghost btn-sm" onclick="window.__reviseQuote('${esc(myQuote.id)}',${Number(myQuote.unitPrice)})">✏️ Revise Price</button>` : ''}
                </div>
              ` : `
                <form onsubmit="window.__submitQuote(event, '${esc(r.id)}')" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;align-items:end;padding-top:10px;border-top:1px solid var(--color-border);">
                  <div><label class="form-label">Avail Qty *</label><input id="q-qty-${esc(r.id)}" type="number" min="1" class="input-field" value="${esc(r.quantity)}" required /></div>
                  <div><label class="form-label">Unit Price (₹) *</label><input id="q-price-${esc(r.id)}" type="number" step="0.01" min="1" class="input-field" required placeholder="260" /></div>
                  <div><label class="form-label">Bulk Price (₹)</label><input id="q-bprice-${esc(r.id)}" type="number" step="0.01" min="1" class="input-field" placeholder="Optional" /></div>
                  <div><label class="form-label">MOQ</label><input id="q-moq-${esc(r.id)}" type="number" min="1" class="input-field" value="1" /></div>
                  <div><label class="form-label">GST %</label><input id="q-tax-${esc(r.id)}" type="number" step="0.5" min="0" max="40" class="input-field" value="18" /></div>
                  <div><label class="form-label">Delivery (₹)</label><input id="q-del-${esc(r.id)}" type="number" min="0" class="input-field" value="0" /></div>
                  <div><label class="form-label">ETA (Days)</label><input id="q-days-${esc(r.id)}" type="number" min="1" class="input-field" value="5" /></div>
                  <div><label class="form-label">Payment Terms</label><input id="q-pay-${esc(r.id)}" class="input-field" value="Net 15 Days" /></div>
                  <button type="submit" class="btn btn-primary btn-sm">Submit Quote</button>
                </form>
              `}
            </div>`;
        }).join('') : `<div class="card-soft p-6 text-center" style="color:var(--color-text-muted);">No open buyer RFQs available right now.</div>`}
      </div>`;
  }

  // Buyer Mode: Create RFQ + Side-by-Side Quotation Comparison
  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header"><h1>📋 RFQs & Multi-Supplier Quote Comparison</h1><p>Publish RFQs to verified sellers, compare total landed procurement cost transparently, negotiate via KAEN, and convert accepted quotes to Orders.</p></div>

      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:14px;">+ Create Request for Quotation (RFQ)</h3>
        <form onsubmit="window.__createRfq(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px;align-items:end;">
          <div><label class="form-label">RFQ Title *</label><input id="rfq-title" class="input-field" placeholder="School Uniform Bulk Q4" required /></div>
          <div><label class="form-label">Product Name *</label><input id="rfq-prod" class="input-field" placeholder="Cotton Uniform Shirt" required /></div>
          <div><label class="form-label">Category *</label><input id="rfq-cat" class="input-field" placeholder="Textiles & Garments" required /></div>
          <div><label class="form-label">Quantity *</label><input id="rfq-qty" type="number" min="1" class="input-field" value="500" required /></div>
          <div><label class="form-label">Unit</label><input id="rfq-unit" class="input-field" value="pcs" required /></div>
          <div><label class="form-label">Target Max (₹/unit)</label><input id="rfq-max" type="number" step="0.01" class="input-field" placeholder="280" /></div>
          <div><label class="form-label">Delivery City *</label><input id="rfq-city" class="input-field" value="${esc(store.user?.organization?.city || '')}" required /></div>
          <div><label class="form-label">Target Supplier</label>
            <select id="rfq-seller" class="input-field select-field">
              <option value="">All Verified Sellers (Broadcast)</option>
              ${sellers.map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${esc(s.businessType)})</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Payment Preference</label><input id="rfq-pay" class="input-field" placeholder="Net 15 Days" /></div>
          <div style="grid-column:1 / -1;"><label class="form-label">Specifications</label><input id="rfq-spec" class="input-field" placeholder="GSM, sizes, packaging, delivery schedule…" /></div>
          <button type="submit" class="btn btn-primary">Send RFQ to Sellers</button>
        </form>
      </div>

      ${rfqs.length ? rfqs.map((r) => `
        <div class="card-soft p-6" style="display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <span class="badge badge-brand">${esc(r.rfqNumber)}</span>
              <span class="badge ${r.status === 'AWARDED' ? 'badge-active' : 'badge-pending'}" style="margin-left:6px;">${esc(r.status)}</span>
              <h3 style="font-weight:800;margin-top:6px;">${esc(r.title)} · ${esc(r.productName)} (${esc(r.quantity)} ${esc(r.unit)})</h3>
              <div style="font-size:var(--text-xs);color:var(--color-text-muted);">Deliver to ${esc(r.deliveryCity)} · Created ${esc(fmtDate(r.createdAt))}</div>
            </div>
            <span class="badge badge-muted">${(r.quotations || []).length} quotation(s)</span>
          </div>

          ${(r.quotations || []).length ? `
            <div style="overflow-x:auto;">
              <table class="data-table">
                <thead><tr><th>Supplier</th><th>Quote #</th><th>Unit / Bulk</th><th>Tax + Delivery</th><th>Total Landed Cost</th><th>ETA & Terms</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  ${r.quotations.map((q, idx) => `
                    <tr>
                      <td><strong>${esc(q.sellerOrg?.name)}</strong><div style="font-size:11px;color:var(--color-text-muted);">${esc(q.sellerOrg?.businessType)} · ${esc(q.sellerOrg?.city)} ${q.sellerOrg?.gstVerified ? '· ✓ GST' : ''}</div></td>
                      <td><code>${esc(q.quoteNumber)}</code><div style="font-size:10px;color:var(--color-text-muted);">Rev ${esc(q.revision)}</div></td>
                      <td>₹${esc(q.unitPrice)}${q.bulkPrice ? `<div style="font-size:11px;color:var(--color-success);">Bulk ₹${esc(q.bulkPrice)}</div>` : ''}</td>
                      <td>${esc(q.taxRatePct)}% GST + ₹${esc(q.deliveryCharge)}</td>
                      <td><strong style="color:var(--color-primary);">₹${Number(q.totalAmount).toLocaleString('en-IN')}</strong> ${idx === 0 && r.quotations.length > 1 ? '<span class="badge badge-active" style="font-size:10px;">Lowest</span>' : ''}</td>
                      <td style="font-size:11px;">${esc(q.estimatedDeliveryDays)} days<br/>${esc(q.paymentTerms)}</td>
                      <td><span class="badge ${q.status === 'ACCEPTED' ? 'badge-active' : q.status === 'REJECTED' ? 'badge-rejected' : 'badge-pending'}">${esc(q.status)}</span></td>
                      <td>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                          ${['SUBMITTED', 'REVISED', 'NEGOTIATING'].includes(q.status) ? `
                            <button class="btn btn-sm" style="background:var(--color-success-bg);color:var(--color-success);" onclick="window.__acceptQuote('${esc(q.id)}')">✓ Accept</button>
                            <button class="btn btn-primary btn-sm" onclick="window.__startKaenFromQuote('${esc(q.id)}',${Number(q.bulkPrice || q.unitPrice)})">🤝 KAEN</button>
                            <button class="btn btn-danger btn-sm" onclick="window.__rejectQuote('${esc(q.id)}')">✗</button>
                          ` : ''}
                          ${q.status === 'ACCEPTED' ? `<button class="btn btn-primary btn-sm" onclick="window.__convertQuoteToOrder('${esc(q.id)}')">🛒 Create Order</button>` : ''}
                        </div>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          ` : `<p style="font-size:var(--text-sm);color:var(--color-text-muted);">Waiting for seller quotations…</p>`}
        </div>
      `).join('') : `<div class="card-soft p-6 text-center" style="color:var(--color-text-muted);">No RFQs created yet. Submit your first RFQ above.</div>`}
    </div>`;
}
