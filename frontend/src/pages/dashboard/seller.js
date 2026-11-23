/**
 * SAHAYAK B2B — Unified Adaptive Seller Portal
 * Serves Wholesalers, Manufacturers, Distributors, and Suppliers from live PostgreSQL APIs.
 * Dynamically enables Manufacturer Factory & Production QC workspace when businessType === 'MANUFACTURER'.
 */

import { store, setState, persistUser } from '../../store.js';
import { api } from '../../api.js';
import { renderSidebar } from '../../components/sidebar.js';
import { AICopilot } from '../../components/ai-copilot.js';
import { KaenRoom } from '../../components/kaen-room.js';
import {
  renderOrgProfileAndBranches,
  renderTeamManagement,
  renderVerificationDocuments
} from '../../components/org-management.js';
import { renderPartnershipsPanel } from '../../components/partnerships-panel.js';
import { renderRfqPanel } from '../../components/rfq-panel.js';
import { renderB2bChatPanel, stopB2bChatPolling } from '../../components/b2b-chat.js';
import { renderOrdersPanel } from '../../components/orders-panel.js';
import { showToast } from '../../components/toast.js';
import { navigate } from '../../router.js';
import { esc } from '../../utils/sanitize.js';

let activeTab = 'overview';

const TITLES = {
  overview: 'Seller Overview',
  rfq: 'Incoming Buyer RFQs & Quotations',
  orders: 'Orders & Logistics Dispatch',
  partnerships: 'Business Partnerships',
  chat: 'B2B Business Chat',
  catalogue: 'Product Catalogue & Inventory',
  production: 'Factory Production & QC',
  kaen: 'KAEN Negotiation Room',
  team: 'Team & Worker Management',
  branches: 'Organization Profile & Branches',
  documents: 'Verification Documents'
};

export default function renderSellerDashboard(container) {
  activeTab = 'overview';
  container.innerHTML = `
    <div class="dashboard-layout dashboard-with-copilot">
      <div id="sidebar-mount"></div>
      <div class="dashboard-main">
        <div class="topbar" id="topbar"></div>
        <div class="dashboard-content" id="main-content"></div>
      </div>
      <div id="copilot-mount"></div>
    </div>
    <div class="mobile-nav"><div class="mobile-nav-items">
      ${[['📊', 'Overview', 'overview'], ['📦', 'Products', 'catalogue'], ['🤝', 'KAEN', 'kaen'], ['👷', 'Team', 'team']].map(([icon, label, tab]) => `
        <button class="mobile-nav-item" onclick="window.__sidebarNav('${tab}')">
          <span class="mobile-nav-icon">${icon}</span><span>${label}</span>
        </button>`).join('')}
    </div></div>
  `;

  renderSidebar(
    document.getElementById('sidebar-mount'),
    activeTab,
    (tab) => { activeTab = tab; renderTab(tab); updateNavActive(tab); },
    handleLogout
  );
  mountTopbar();
  new AICopilot(document.getElementById('copilot-mount'));
  renderTab(activeTab);
}

function mountTopbar() {
  const user = store.user;
  const bizType = user?.organization?.businessType || user?.role || 'SELLER';
  const bar = document.getElementById('topbar');
  if (!bar) return;
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <button class="btn btn-icon btn-ghost mobile-menu-toggle" onclick="openSidebar()">☰</button>
      <div class="topbar-title" id="topbar-title">Seller Overview</div>
    </div>
    <div class="topbar-actions">
      ${store.demoMode ? '<span class="badge badge-warning">Demo Mode</span>' : ''}
      <span class="badge badge-brand">SELLER · ${esc(bizType)}</span>
      <div class="avatar avatar-sm">${esc((user?.fullName || 'S')[0].toUpperCase())}</div>
    </div>
  `;
}

async function renderTab(tab) {
  const content = document.getElementById('main-content');
  if (!content) return;
  const t = document.getElementById('topbar-title');
  if (t) t.textContent = TITLES[tab] || 'Seller Portal';

  if (tab !== 'chat') stopB2bChatPolling();
  if (tab === 'kaen') {
    content.innerHTML = `<div class="page-enter"><div id="kaen-mount"></div></div>`;
    new KaenRoom(document.getElementById('kaen-mount'));
    return;
  }

  content.innerHTML = `<div class="page-enter"><p style="color:var(--color-text-muted);">Loading…</p></div>`;
  try {
    let html = '';
    const refresh = () => renderTab(tab);
    if (tab === 'overview') html = await overviewTab();
    else if (tab === 'rfq') html = await renderRfqPanel(refresh, { mode: 'seller' });
    else if (tab === 'orders') html = await renderOrdersPanel(refresh);
    else if (tab === 'partnerships') html = await renderPartnershipsPanel(refresh);
    else if (tab === 'chat') html = await renderB2bChatPanel(refresh);
    else if (tab === 'catalogue') html = await catalogueTab();
    else if (tab === 'production') html = await productionTab();
    else if (tab === 'team') html = await renderTeamManagement(refresh);
    else if (tab === 'branches') html = await renderOrgProfileAndBranches(refresh);
    else if (tab === 'documents') html = await renderVerificationDocuments(refresh);

    if (tab !== activeTab) return;
    content.innerHTML = `<div class="page-enter">${html}</div>`;
  } catch (err) {
    if (tab !== activeTab) return;
    content.innerHTML = `<div class="alert alert-danger"><span>❌</span><div>${esc(err.message || 'Failed to load seller data.')}</div></div>`;
  }
}

async function overviewTab() {
  const d = await api.getSellerOverview();
  const s = d.stats;
  const isMfg = d.businessType === 'MANUFACTURER';

  return `
    <div class="stagger-children" style="display:flex;flex-direction:column;gap:20px;">
      <div class="card-soft p-6" style="background:var(--grad-soft);border:1px solid var(--color-brand-200,#ddd6fe);">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
          <div>
            <span class="badge badge-brand">${esc(d.businessType)} · SELLER PORTAL</span>
            <h1 style="font-size:var(--text-2xl);font-weight:900;margin-top:8px;">${esc(d.organizationName)}</h1>
            <p style="font-size:var(--text-sm);color:var(--color-text-secondary);margin-top:4px;">
              ${isMfg ? 'Manage factory production orders, QC inspections, product catalogue, and your workforce.' : 'Manage bulk product catalogue, stock tiers, branches, and your team.'}
            </p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="window.__sidebarNav('catalogue')">+ Manage Catalogue</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:14px;">
        ${metric('Active SKUs', s.activeProducts, '📦', 'brand', `${s.totalProducts} total listed`)}
        ${metric('Stock Units', s.totalStockUnits, '🏗️', 'success', `${s.lowStockProducts} low-stock alerts`)}
        ${isMfg ? metric('Production Orders', s.productionOrders ?? 0, '🏭', 'brand', `${s.inProduction ?? 0} active · ${s.completedProduction ?? 0} done`) : ''}
        ${metric('Team Members', s.teamMembers, '👷', 'brand', 'active in organization')}
        ${metric('Branches', s.branches, '🏢', '', `${s.verificationDocs} verification docs`)}
      </div>

      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:10px;">Quick Actions</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" onclick="window.__sidebarNav('catalogue')">📦 Add / Update Product</button>
          ${isMfg ? `<button class="btn btn-ghost btn-sm" onclick="window.__sidebarNav('production')">🏭 Production Orders</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="window.__sidebarNav('team')">👷 Invite Worker</button>
          <button class="btn btn-ghost btn-sm" onclick="window.__sidebarNav('branches')">🏢 Add Warehouse / Branch</button>
          <button class="btn btn-ghost btn-sm" onclick="window.__sidebarNav('kaen')">🤝 Open KAEN Room</button>
        </div>
      </div>
    </div>`;
}

async function catalogueTab() {
  const { products = [] } = await api.getSellerProducts();

  window.__createProduct = async (e) => {
    e.preventDefault();
    try {
      await api.createSellerProduct({
        sku: document.getElementById('sp-sku')?.value.trim(),
        name: document.getElementById('sp-name')?.value.trim(),
        category: document.getElementById('sp-cat')?.value.trim(),
        brand: document.getElementById('sp-brand')?.value.trim() || '',
        unit: document.getElementById('sp-unit')?.value.trim() || 'unit',
        moq: Number(document.getElementById('sp-moq')?.value || 1),
        unitPrice: Number(document.getElementById('sp-price')?.value),
        bulkPrice: document.getElementById('sp-bprice')?.value ? Number(document.getElementById('sp-bprice')?.value) : null,
        bulkMinQty: document.getElementById('sp-bqty')?.value ? Number(document.getElementById('sp-bqty')?.value) : null,
        stockQty: Number(document.getElementById('sp-stock')?.value || 0),
        lowStockThreshold: Number(document.getElementById('sp-low')?.value || 10)
      });
      showToast('Product added to live catalogue!', 'success');
      renderTab('catalogue');
    } catch (err) {
      showToast(err.message || 'Failed to create product.', 'error');
    }
  };

  window.__adjustProductStock = async (id, currentStock) => {
    const next = window.prompt('Enter updated stock quantity:', String(currentStock));
    if (next === null) return;
    const qty = Number(next);
    if (Number.isNaN(qty) || qty < 0) return showToast('Enter a valid non-negative number.', 'warning');
    try { await api.updateSellerProduct(id, { stockQty: qty }); showToast('Stock updated!', 'success'); renderTab('catalogue'); }
    catch (err) { showToast(err.message, 'error'); }
  };

  window.__deleteProduct = async (id) => {
    if (!window.confirm('Remove this product from your catalogue?')) return;
    try { await api.deleteSellerProduct(id); showToast('Product removed.', 'info'); renderTab('catalogue'); }
    catch (err) { showToast(err.message, 'error'); }
  };

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header"><h1>📦 Product Catalogue & Inventory</h1><p>Products listed here are live and discoverable by Buyers on Sahayak B2B.</p></div>

      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:14px;">+ Add New Product</h3>
        <form onsubmit="window.__createProduct(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;">
          <div><label class="form-label">SKU *</label><input id="sp-sku" class="input-field" placeholder="TEX-SHIRT-01" required /></div>
          <div><label class="form-label">Product Name *</label><input id="sp-name" class="input-field" placeholder="Cotton Uniform Shirt" required /></div>
          <div><label class="form-label">Category *</label><input id="sp-cat" class="input-field" placeholder="Textiles & Garments" required /></div>
          <div><label class="form-label">Brand</label><input id="sp-brand" class="input-field" placeholder="Optional" /></div>
          <div><label class="form-label">Unit</label><input id="sp-unit" class="input-field" value="pcs" required /></div>
          <div><label class="form-label">MOQ *</label><input id="sp-moq" type="number" min="1" class="input-field" value="50" required /></div>
          <div><label class="form-label">Unit Price (₹) *</label><input id="sp-price" type="number" step="0.01" min="1" class="input-field" placeholder="280" required /></div>
          <div><label class="form-label">Bulk Price (₹)</label><input id="sp-bprice" type="number" step="0.01" min="1" class="input-field" placeholder="250" /></div>
          <div><label class="form-label">Bulk Min Qty</label><input id="sp-bqty" type="number" min="1" class="input-field" placeholder="500" /></div>
          <div><label class="form-label">Initial Stock *</label><input id="sp-stock" type="number" min="0" class="input-field" value="100" required /></div>
          <div><label class="form-label">Low Stock Alert</label><input id="sp-low" type="number" min="0" class="input-field" value="20" /></div>
          <button type="submit" class="btn btn-primary">Add Product</button>
        </form>
      </div>

      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Unit / Bulk Price</th><th>MOQ</th><th>Stock</th><th>Actions</th></tr></thead>
          <tbody>
            ${products.map((p) => `
              <tr>
                <td><code>${esc(p.sku)}</code></td>
                <td><strong>${esc(p.name)}</strong>${p.brand ? `<div style="font-size:11px;color:var(--color-text-muted);">${esc(p.brand)}</div>` : ''}</td>
                <td>${esc(p.category)}</td>
                <td>₹${esc(p.unitPrice)}/${esc(p.unit)}${p.bulkPrice ? `<div style="font-size:11px;color:var(--color-success);">Bulk: ₹${esc(p.bulkPrice)} (${esc(p.bulkMinQty || p.moq)}+)</div>` : ''}</td>
                <td>${esc(p.moq)} ${esc(p.unit)}</td>
                <td><span class="badge ${p.stockQty <= p.lowStockThreshold ? 'badge-warning' : 'badge-active'}">${esc(p.stockQty)} ${esc(p.unit)}</span></td>
                <td><div style="display:flex;gap:6px;">
                  <button class="btn btn-ghost btn-sm" onclick="window.__adjustProductStock('${esc(p.id)}',${Number(p.stockQty)})">Stock</button>
                  <button class="btn btn-danger btn-sm" onclick="window.__deleteProduct('${esc(p.id)}')">Delete</button>
                </div></td>
              </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);">No products in your catalogue yet. Add your first product above.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function productionTab() {
  const { orders = [] } = await api.getProductionOrders();

  window.__createProdOrder = async (e) => {
    e.preventDefault();
    try {
      await api.createProductionOrder({
        orderNumber: document.getElementById('po-num')?.value.trim(),
        productName: document.getElementById('po-prod')?.value.trim(),
        targetQty: Number(document.getElementById('po-qty')?.value),
        rawMaterialsNote: document.getElementById('po-raw')?.value.trim() || '',
        dueDate: document.getElementById('po-due')?.value || null
      });
      showToast('Production order scheduled!', 'success');
      renderTab('production');
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.__updateProdOrder = async (id, field, value) => {
    try {
      await api.updateProductionOrder(id, { [field]: value });
      showToast('Production order updated!', 'success');
      renderTab('production');
    } catch (err) { showToast(err.message, 'error'); }
  };

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header"><h1>🏭 Factory Production & Quality Control</h1><p>Manufacturer-specific production scheduling, stages, and QC tracking</p></div>

      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:14px;">+ Schedule Production Order</h3>
        <form onsubmit="window.__createProdOrder(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;">
          <div><label class="form-label">Batch / Order # *</label><input id="po-num" class="input-field" placeholder="PROD-2026-01" required /></div>
          <div><label class="form-label">Product Name *</label><input id="po-prod" class="input-field" placeholder="100% Cotton Twill Fabric" required /></div>
          <div><label class="form-label">Target Qty *</label><input id="po-qty" type="number" min="1" class="input-field" placeholder="5000" required /></div>
          <div><label class="form-label">Raw Materials Note</label><input id="po-raw" class="input-field" placeholder="40s combed cotton yarn" /></div>
          <div><label class="form-label">Target Date</label><input id="po-due" type="date" class="input-field" /></div>
          <button type="submit" class="btn btn-primary">Schedule Batch</button>
        </form>
      </div>

      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Order #</th><th>Product & Materials</th><th>Target Qty</th><th>Stage</th><th>QC Status</th></tr></thead>
          <tbody>
            ${orders.map((o) => `
              <tr>
                <td><code>${esc(o.orderNumber)}</code></td>
                <td><strong>${esc(o.productName)}</strong>${o.rawMaterialsNote ? `<div style="font-size:11px;color:var(--color-text-muted);">${esc(o.rawMaterialsNote)}</div>` : ''}</td>
                <td>${esc(o.completedQty)} / <strong>${esc(o.targetQty)}</strong></td>
                <td>
                  <select onchange="window.__updateProdOrder('${esc(o.id)}','stage',this.value)" class="input-field select-field" style="width:155px;padding:4px 8px;font-size:12px;">
                    ${['PLANNED', 'RAW_MATERIAL', 'IN_PRODUCTION', 'QUALITY_CHECK', 'COMPLETED', 'ON_HOLD'].map((st) => `<option value="${st}" ${o.stage === st ? 'selected' : ''}>${st}</option>`).join('')}
                  </select>
                </td>
                <td>
                  <select onchange="window.__updateProdOrder('${esc(o.id)}','qcStatus',this.value)" class="input-field select-field" style="width:120px;padding:4px 8px;font-size:12px;">
                    ${['PENDING', 'PASSED', 'FAILED', 'REWORK'].map((qc) => `<option value="${qc}" ${o.qcStatus === qc ? 'selected' : ''}>${qc}</option>`).join('')}
                  </select>
                </td>
              </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);">No production orders scheduled yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

function metric(label, value, icon, colorClass, sub) {
  return `
    <div class="card-metric">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div class="metric-label">${esc(label)}</div><span style="font-size:20px;">${icon}</span>
      </div>
      <div class="metric-value ${colorClass}">${esc(Number(value ?? 0).toLocaleString())}</div>
      <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:4px;">${esc(sub)}</div>
    </div>`;
}

function updateNavActive(tab) {
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
  document.getElementById(`nav-${tab}`)?.classList.add('active');
}

async function handleLogout() {
  try { await api.logout(); } catch {}
  persistUser(null);
  setState({ user: null, demoMode: false });
  navigate('/');
}
