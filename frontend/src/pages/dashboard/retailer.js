/**
 * SAHAYAK B2B — Live Buyer Portal (Retailers, Shop Owners, Institutional Buyers)
 * Backed 100% by PostgreSQL APIs (/api/buyer/* and /api/org/*). Zero hardcoded fake data.
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
import { showToast } from '../../components/toast.js';
import { navigate } from '../../router.js';
import { esc } from '../../utils/sanitize.js';

let activeTab = 'overview';
let supplierQuery = { search: '', businessType: '', city: '' };
let productQuery = { search: '', category: '' };

const TITLES = {
  overview: 'Buyer Dashboard',
  suppliers: 'Supplier Discovery',
  catalogue: 'Product Discovery',
  requests: 'Purchase Requests',
  saved: 'Saved Suppliers',
  kaen: 'KAEN Negotiation Room',
  team: 'Team & Workers',
  branches: 'Organization Profile & Branches',
  documents: 'Verification Documents'
};

export default function renderRetailerDashboard(container) {
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
      ${[['🏠', 'Home', 'overview'], ['🏭', 'Suppliers', 'suppliers'], ['📦', 'Products', 'catalogue'], ['📋', 'Requests', 'requests']].map(([icon, label, tab]) => `
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
  const bar = document.getElementById('topbar');
  if (!bar) return;
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <button class="btn btn-icon btn-ghost mobile-menu-toggle" onclick="openSidebar()">☰</button>
      <div class="topbar-title" id="topbar-title">Buyer Dashboard</div>
    </div>
    <div class="topbar-actions">
      ${store.demoMode ? '<span class="badge badge-warning">Demo Mode</span>' : ''}
      <span class="badge badge-brand">BUYER PORTAL</span>
      <div class="avatar avatar-sm">${esc((user?.fullName || 'B')[0].toUpperCase())}</div>
    </div>
  `;
}

async function renderTab(tab) {
  const content = document.getElementById('main-content');
  if (!content) return;
  const t = document.getElementById('topbar-title');
  if (t) t.textContent = TITLES[tab] || 'Buyer Portal';

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
    else if (tab === 'suppliers') html = await suppliersTab();
    else if (tab === 'catalogue') html = await catalogueTab();
    else if (tab === 'requests') html = await requestsTab();
    else if (tab === 'saved') html = await savedTab();
    else if (tab === 'team') html = await renderTeamManagement(refresh);
    else if (tab === 'branches') html = await renderOrgProfileAndBranches(refresh);
    else if (tab === 'documents') html = await renderVerificationDocuments(refresh);

    if (tab !== activeTab) return;
    content.innerHTML = `<div class="page-enter">${html}</div>`;
  } catch (err) {
    if (tab !== activeTab) return;
    content.innerHTML = `<div class="alert alert-danger"><span>❌</span><div>${esc(err.message || 'Failed to load buyer data.')}</div></div>`;
  }
}

async function overviewTab() {
  const d = await api.getBuyerOverview();
  const s = d.stats;
  return `
    <div class="stagger-children" style="display:flex;flex-direction:column;gap:20px;">
      <div class="card-soft p-6" style="background:var(--grad-soft);border:1px solid var(--color-brand-200,#ddd6fe);">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
          <div>
            <span class="badge badge-brand">BUYER PORTAL</span>
            <h1 style="font-size:var(--text-2xl);font-weight:900;margin-top:8px;">${esc(d.organizationName)}</h1>
            <p style="font-size:var(--text-sm);color:var(--color-text-secondary);margin-top:4px;">
              Discover verified wholesalers, manufacturers, distributors, and suppliers across Sahayak B2B.
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" onclick="window.__sidebarNav('suppliers')">🏭 Find Suppliers</button>
            <button class="btn btn-ghost btn-sm" onclick="window.__sidebarNav('requests')">+ New Purchase Request</button>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:14px;">
        ${metric('Verified Suppliers', s.verifiedSuppliers, '🏭', 'brand', 'active sellers on platform')}
        ${metric('Discoverable Products', s.liveProducts, '📦', 'success', 'live seller SKUs')}
        ${metric('Open Requests', s.openRequests, '📋', 'brand', `${s.totalRequests} total requests`)}
        ${metric('Saved Suppliers', s.savedSuppliers, '⭐', 'success', 'shortlisted partners')}
        ${metric('Team / Branches', `${s.teamMembers} / ${s.branches}`, '🏢', '', 'members & locations')}
      </div>
    </div>`;
}

async function suppliersTab() {
  const { suppliers = [] } = await api.discoverSuppliers(supplierQuery);

  window.__filterSuppliers = (e) => {
    e.preventDefault();
    supplierQuery = {
      search: document.getElementById('bs-search')?.value.trim() || '',
      businessType: document.getElementById('bs-type')?.value || '',
      city: document.getElementById('bs-city')?.value.trim() || ''
    };
    renderTab('suppliers');
  };

  window.__toggleSaveSupplier = async (id, isSaved) => {
    try {
      if (isSaved) {
        await api.removeSavedSupplier(id);
        showToast('Removed from saved suppliers.', 'info');
      } else {
        await api.saveSupplier(id);
        showToast('Supplier saved!', 'success');
      }
      renderTab('suppliers');
    } catch (err) { showToast(err.message, 'error'); }
  };

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;">
        <div><h1>🏭 Supplier Discovery</h1><p>Only admin-verified, active Seller organizations appear here. No fabricated ratings.</p></div>
        <form onsubmit="window.__filterSuppliers(event)" style="display:flex;gap:8px;flex-wrap:wrap;">
          <input id="bs-search" class="input-field" placeholder="Search supplier or category…" value="${esc(supplierQuery.search)}" style="width:200px;" />
          <select id="bs-type" class="input-field select-field" style="width:150px;">
            <option value="">All Seller Types</option>
            ${['WHOLESALER', 'MANUFACTURER', 'DISTRIBUTOR', 'SUPPLIER'].map((t) => `<option value="${t}" ${supplierQuery.businessType === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          <input id="bs-city" class="input-field" placeholder="City" value="${esc(supplierQuery.city)}" style="width:130px;" />
          <button type="submit" class="btn btn-primary btn-sm">Search</button>
        </form>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">
        ${suppliers.map((s) => `
          <div class="card-soft p-5" style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:8px;">
              <div>
                <h3 style="font-weight:800;font-size:var(--text-base);">${esc(s.name)}</h3>
                <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${esc(s.category)} · ${esc(s.city)}, ${esc(s.state)}</div>
              </div>
              <span class="badge badge-brand">${esc(s.businessType)}</span>
            </div>
            <p style="font-size:var(--text-xs);color:var(--color-text-secondary);min-height:32px;">${esc(s.description || 'Verified B2B seller on Sahayak B2B.')}</p>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${s.gstVerified ? '<span class="badge badge-active">✓ GST Verified</span>' : '<span class="badge badge-active">✓ Verified Org</span>'}
              <span class="badge badge-muted">${esc(s.productCount)} active SKUs</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:auto;padding-top:8px;border-top:1px solid var(--color-border);">
              <button class="btn ${s.isSaved ? 'btn-ghost' : 'btn-primary'} btn-sm" style="flex:1;" onclick="window.__toggleSaveSupplier('${esc(s.id)}', ${s.isSaved})">
                ${s.isSaved ? '★ Saved' : '☆ Save Supplier'}
              </button>
              <button class="btn btn-ghost btn-sm" onclick="window.__sidebarNav('requests')">Create PR</button>
            </div>
          </div>`).join('') || `<div class="card-soft p-6" style="grid-column:1/-1;text-align:center;color:var(--color-text-muted);">No verified suppliers match your search yet.</div>`}
      </div>
    </div>`;
}

async function catalogueTab() {
  const { products = [] } = await api.discoverProducts(productQuery);

  window.__filterProducts = (e) => {
    e.preventDefault();
    productQuery = {
      search: document.getElementById('bp-search')?.value.trim() || '',
      category: document.getElementById('bp-cat')?.value.trim() || ''
    };
    renderTab('catalogue');
  };

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;">
        <div><h1>📦 Product Discovery</h1><p>Real active product listings published by verified Sellers</p></div>
        <form onsubmit="window.__filterProducts(event)" style="display:flex;gap:8px;flex-wrap:wrap;">
          <input id="bp-search" class="input-field" placeholder="Search name, SKU, brand…" value="${esc(productQuery.search)}" style="width:200px;" />
          <input id="bp-cat" class="input-field" placeholder="Category" value="${esc(productQuery.category)}" style="width:150px;" />
          <button type="submit" class="btn btn-primary btn-sm">Filter</button>
        </form>
      </div>
      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Product & SKU</th><th>Supplier</th><th>Category</th><th>Unit / Bulk Price</th><th>MOQ</th><th>Stock</th></tr></thead>
          <tbody>
            ${products.map((p) => `
              <tr>
                <td><strong>${esc(p.name)}</strong><div style="font-size:11px;color:var(--color-text-muted);">SKU: ${esc(p.sku)}</div></td>
                <td><strong>${esc(p.organization?.name)}</strong><div style="font-size:11px;color:var(--color-text-muted);">${esc(p.organization?.businessType)} · ${esc(p.organization?.city)}</div></td>
                <td>${esc(p.category)}</td>
                <td><strong>₹${esc(p.unitPrice)}</strong>/${esc(p.unit)}${p.bulkPrice ? `<div style="font-size:11px;color:var(--color-success);">Bulk ₹${esc(p.bulkPrice)} (${esc(p.bulkMinQty || p.moq)}+)</div>` : ''}</td>
                <td>${esc(p.moq)} ${esc(p.unit)}</td>
                <td><span class="badge ${p.stockQty > 0 ? 'badge-active' : 'badge-muted'}">${esc(p.stockQty)} ${esc(p.unit)}</span></td>
              </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);">No live seller products found yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function requestsTab() {
  const { requests = [] } = await api.getPurchaseRequests();

  window.__createPR = async (e) => {
    e.preventDefault();
    try {
      await api.createPurchaseRequest({
        title: document.getElementById('pr-title')?.value.trim(),
        category: document.getElementById('pr-cat')?.value.trim(),
        quantity: Number(document.getElementById('pr-qty')?.value),
        unit: document.getElementById('pr-unit')?.value.trim() || 'units',
        targetPrice: document.getElementById('pr-price')?.value ? Number(document.getElementById('pr-price')?.value) : null,
        deliveryCity: document.getElementById('pr-city')?.value.trim(),
        requiredBy: document.getElementById('pr-date')?.value || null,
        notes: document.getElementById('pr-notes')?.value.trim() || ''
      });
      showToast('Purchase request created!', 'success');
      renderTab('requests');
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.__updatePRStatus = async (id, status) => {
    try { await api.updatePurchaseRequest(id, { status }); showToast(`Request marked ${status}`, 'success'); renderTab('requests'); }
    catch (err) { showToast(err.message, 'error'); }
  };

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header"><h1>📋 Purchase Requests</h1><p>Create and track procurement requests for your organization</p></div>

      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:14px;">+ New Purchase Request</h3>
        <form onsubmit="window.__createPR(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;">
          <div><label class="form-label">Item / Requirement *</label><input id="pr-title" class="input-field" placeholder="500 Cotton School Shirts" required /></div>
          <div><label class="form-label">Category *</label><input id="pr-cat" class="input-field" placeholder="Textiles & Garments" required /></div>
          <div><label class="form-label">Quantity *</label><input id="pr-qty" type="number" min="1" class="input-field" value="100" required /></div>
          <div><label class="form-label">Unit</label><input id="pr-unit" class="input-field" value="pcs" required /></div>
          <div><label class="form-label">Target Price (₹)</label><input id="pr-price" type="number" step="0.01" class="input-field" placeholder="260" /></div>
          <div><label class="form-label">Delivery City *</label><input id="pr-city" class="input-field" value="${esc(store.user?.organization?.city || '')}" required /></div>
          <div><label class="form-label">Required By</label><input id="pr-date" type="date" class="input-field" /></div>
          <div><label class="form-label">Notes</label><input id="pr-notes" class="input-field" placeholder="Quality specs / delivery terms" /></div>
          <button type="submit" class="btn btn-primary">Submit Request</button>
        </form>
      </div>

      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Requirement</th><th>Qty</th><th>Target Price</th><th>Delivery City</th><th>Status</th><th>Update</th></tr></thead>
          <tbody>
            ${requests.map((r) => `
              <tr>
                <td><strong>${esc(r.title)}</strong><div style="font-size:11px;color:var(--color-text-muted);">${esc(r.category)}${r.notes ? ' · ' + esc(r.notes) : ''}</div></td>
                <td>${esc(r.quantity)} ${esc(r.unit)}</td>
                <td>${r.targetPrice ? '₹' + esc(r.targetPrice) : '—'}</td>
                <td>${esc(r.deliveryCity)}</td>
                <td><span class="badge ${r.status === 'OPEN' ? 'badge-brand' : r.status === 'CONVERTED' ? 'badge-active' : 'badge-muted'}">${esc(r.status)}</span></td>
                <td>
                  <select onchange="window.__updatePRStatus('${esc(r.id)}', this.value)" class="input-field select-field" style="width:130px;padding:4px 8px;font-size:12px;">
                    ${['OPEN', 'REVIEWED', 'CONVERTED', 'CANCELLED'].map((st) => `<option value="${st}" ${r.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                  </select>
                </td>
              </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);">No purchase requests yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function savedTab() {
  const { saved = [] } = await api.getSavedSuppliers();
  window.__removeSaved = async (id) => {
    try { await api.removeSavedSupplier(id); showToast('Removed from saved list.', 'info'); renderTab('saved'); }
    catch (err) { showToast(err.message, 'error'); }
  };
  return `
    <div class="animate-fadeInUp">
      <div class="page-header"><h1>⭐ Saved Suppliers</h1><p>${saved.length} shortlisted supplier organization(s)</p></div>
      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Supplier</th><th>Type</th><th>Category</th><th>Location</th><th>Action</th></tr></thead>
          <tbody>
            ${saved.map((item) => `
              <tr>
                <td><strong>${esc(item.supplierOrg?.name)}</strong></td>
                <td><span class="badge badge-brand">${esc(item.supplierOrg?.businessType)}</span></td>
                <td>${esc(item.supplierOrg?.category)}</td>
                <td>${esc(item.supplierOrg?.city)}, ${esc(item.supplierOrg?.state)}</td>
                <td><button class="btn btn-danger btn-sm" onclick="window.__removeSaved('${esc(item.supplierOrgId)}')">Remove</button></td>
              </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);">No saved suppliers yet. Discover suppliers first.</td></tr>'}
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
      <div class="metric-value ${colorClass}">${esc(value)}</div>
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
