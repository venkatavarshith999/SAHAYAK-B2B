/**
 * SAHAYAK B2B — Phase D Module 5: Shared B2B Orders & Logistics Dispatch Panel
 * Works for both Buyer and Seller organizations with live status transitions,
 * Logistics Shipment dispatch, receipt confirmation, and cancellation workflow.
 */

import { api } from '../api.js';
import { showToast } from './toast.js';
import { esc, fmtDate } from '../utils/sanitize.js';

export async function renderOrdersPanel(onRefresh) {
  const [{ orders = [] }, { partners = [] }] = await Promise.all([
    api.getOrders(),
    api.getDispatchLogisticsPartners().catch(() => ({ partners: [] }))
  ]);

  window.__updateOrder = async (orderId, status, paymentStatus = undefined) => {
    let reason = '';
    if (status === 'CANCELLED') {
      reason = window.prompt('Enter required cancellation reason:');
      if (!reason) return;
    }
    try {
      await api.updateOrderStatus(orderId, {
        ...(status ? { status } : {}),
        ...(paymentStatus ? { paymentStatus } : {}),
        ...(reason ? { reason } : {})
      });
      showToast('Order updated!', 'success');
      onRefresh();
    } catch (err) { showToast(err.message || 'Order update failed.', 'error'); }
  };

  window.__dispatchToLogistics = async (e, orderId) => {
    e.preventDefault();
    try {
      const res = await api.requestOrderShipment(orderId, {
        logisticsOrgId: document.getElementById(`dl-org-${orderId}`)?.value,
        weightKg: Number(document.getElementById(`dl-wt-${orderId}`)?.value || 100),
        quotedAmount: document.getElementById(`dl-qt-${orderId}`)?.value ? Number(document.getElementById(`dl-qt-${orderId}`)?.value) : null
      });
      showToast(`Shipment ${res.shipment?.trackingCode} requested from logistics partner!`, 'success');
      onRefresh();
    } catch (err) { showToast(err.message || 'Shipment dispatch failed.', 'error'); }
  };

  const badgeCls = (st) => ['DELIVERED', 'RECEIPT_CONFIRMED'].includes(st) ? 'badge-active' : st === 'CANCELLED' ? 'badge-rejected' : 'badge-brand';

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header"><h1>🛒 B2B Orders & Fulfillment</h1><p>Orders created from accepted Quotations or dual-confirmed KAEN negotiations, connected directly to Transport & Logistics.</p></div>

      ${orders.length ? orders.map((o) => {
        const isBuyer = o.mySide === 'BUYER';
        const activeShip = (o.shipments || [])[0] || null;
        return `
          <div class="card-soft p-6" style="display:flex;flex-direction:column;gap:14px;">
            <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:10px;">
              <div>
                <span class="badge badge-brand">${esc(o.orderNumber)}</span>
                <span class="badge ${badgeCls(o.status)}" style="margin-left:6px;">${esc(o.status.replace(/_/g, ' '))}</span>
                <span class="badge ${o.paymentStatus === 'PAID' ? 'badge-active' : 'badge-pending'}" style="margin-left:6px;">Pay: ${esc(o.paymentStatus)}</span>
                <h3 style="font-weight:800;margin-top:8px;">${esc(o.productName)} × ${esc(o.quantity)} ${esc(o.unit)}</h3>
                <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:4px;">
                  ${isBuyer ? `Seller: <strong>${esc(o.sellerOrg?.name)}</strong>` : `Buyer: <strong>${esc(o.buyerOrg?.name)}</strong>`}
                  · Deliver to: <strong>${esc(o.deliveryCity)}</strong> · Terms: ${esc(o.paymentTerms)} · Created ${esc(fmtDate(o.createdAt))}
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:var(--text-xl);font-weight:900;color:var(--color-primary);">₹${Number(o.totalAmount).toLocaleString('en-IN')}</div>
                <div style="font-size:11px;color:var(--color-text-muted);">₹${esc(o.unitPrice)}/${esc(o.unit)} + ${esc(o.taxRatePct)}% GST + ₹${esc(o.deliveryCharge)} del.</div>
              </div>
            </div>

            ${activeShip ? `
              <div style="padding:10px 14px;border-radius:var(--radius-md);background:var(--color-brand-50,#f5f3ff);font-size:var(--text-xs);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <span>🚚 Shipment <strong>${esc(activeShip.trackingCode)}</strong> via <strong>${esc(activeShip.organization?.name)}</strong></span>
                <span class="badge badge-brand">${esc(activeShip.status)}</span>
              </div>
            ` : ''}

            ${o.cancellationReason ? `<div class="alert alert-danger" style="font-size:var(--text-xs);"><span>🚫</span><div>Cancelled: ${esc(o.cancellationReason)}</div></div>` : ''}

            <!-- Actions -->
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              ${!isBuyer && o.status !== 'CANCELLED' && o.status !== 'RECEIPT_CONFIRMED' ? `
                <select onchange="if(this.value) window.__updateOrder('${esc(o.id)}', this.value)" class="input-field select-field" style="width:190px;padding:6px 8px;font-size:12px;">
                  <option value="">Advance Order Stage…</option>
                  ${['CONFIRMED', 'PROCESSING', 'READY_FOR_DISPATCH', 'SHIPPED', 'DELIVERED'].map((st) => `<option value="${st}">${st.replace(/_/g, ' ')}</option>`).join('')}
                </select>
                <select onchange="if(this.value) window.__updateOrder('${esc(o.id)}', null, this.value)" class="input-field select-field" style="width:155px;padding:6px 8px;font-size:12px;">
                  <option value="">Payment Status…</option>
                  ${['PENDING', 'PARTIAL', 'PAID', 'REFUNDED'].map((ps) => `<option value="${ps}">${ps}</option>`).join('')}
                </select>
              ` : ''}

              ${isBuyer && o.status === 'DELIVERED' ? `
                <button class="btn btn-primary btn-sm" onclick="window.__updateOrder('${esc(o.id)}','RECEIPT_CONFIRMED')">✅ Confirm Goods Received</button>
              ` : ''}

              ${!['SHIPPED', 'DELIVERED', 'RECEIPT_CONFIRMED', 'CANCELLED'].includes(o.status) ? `
                <button class="btn btn-danger btn-sm" onclick="window.__updateOrder('${esc(o.id)}','CANCELLED')">Cancel Order</button>
              ` : ''}
            </div>

            <!-- Seller Logistics Dispatch -->
            ${!isBuyer && !activeShip && ['CONFIRMED', 'PROCESSING', 'READY_FOR_DISPATCH'].includes(o.status) && partners.length ? `
              <form onsubmit="window.__dispatchToLogistics(event, '${esc(o.id)}')" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;align-items:end;padding-top:10px;border-top:1px solid var(--color-border);">
                <div>
                  <label class="form-label">Logistics Partner *</label>
                  <select id="dl-org-${esc(o.id)}" class="input-field select-field" required>
                    ${partners.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.city)})</option>`).join('')}
                  </select>
                </div>
                <div><label class="form-label">Weight (kg) *</label><input id="dl-wt-${esc(o.id)}" type="number" min="1" class="input-field" value="150" required /></div>
                <div><label class="form-label">Budget Quote (₹)</label><input id="dl-qt-${esc(o.id)}" type="number" min="1" class="input-field" placeholder="Optional" /></div>
                <button type="submit" class="btn btn-primary btn-sm">🚚 Request Logistics Pickup</button>
              </form>
            ` : ''}
          </div>`;
      }).join('') : `<div class="card-soft p-6 text-center" style="color:var(--color-text-muted);">No orders yet. Accept a quotation or confirm a KAEN negotiation to create an order.</div>`}
    </div>`;
}
