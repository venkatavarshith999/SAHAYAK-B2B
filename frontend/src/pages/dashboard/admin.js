/**
 * SAHAYAK B2B — Admin / Platform Administration Dashboard
 * Live data from /api/admin/*. Demo data is used ONLY when store.demoMode is true.
 */

import { store, setState, persistUser } from '../../store.js';
import { api, demoData } from '../../api.js';
import { renderSidebar } from '../../components/sidebar.js';
import { showToast } from '../../components/toast.js';
import { navigate } from '../../router.js';

let activeTab = 'overview';
let userFilter = { search: '', role: '', status: '' };
let verStatusFilter = '';

const TITLES = {
  overview: 'Platform Overview', organizations: 'Organizations', users: 'User Management', verification: 'Business Verification',
  transactions: 'Transactions', disputes: 'Disputes', 'ai-usage': 'AI Usage', analytics: 'Platform Analytics',
  'admin-mgmt': 'Admin Management', audit: 'Audit Logs', settings: 'Platform Settings',
  'logistics-mgmt': 'Logistics Partners'
};

// Sections that have no backend API yet (clearly labelled, no fake data)
const PENDING_API = {
  transactions: 'Transactions require the orders & payments module (scheduled for Phase D / Phase G).',
  disputes: 'Disputes require the dispute resolution module (scheduled for Phase G).',
  analytics: 'Revenue analytics require live order & commission data (scheduled for Phase G).',
  settings: 'Platform settings require a settings persistence module (scheduled for Phase G).'
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN') : '—');
const statusClass = (s) => s === 'ACTIVE' ? 'badge-active' : s === 'PENDING_VERIFICATION' ? 'badge-pending' : s === 'REJECTED' ? 'badge-rejected' : 'badge-muted';

export default function renderAdminDashboard(container) {
  container.innerHTML = `
    <div class="dashboard-layout">
      <div id="sidebar-mount"></div>
      <div class="dashboard-main">
        <div class="topbar" id="topbar"></div>
        <div class="dashboard-content" id="main-content"></div>
      </div>
    </div>
    ${renderMobileNav()}
  `;
  mountSidebar();
  mountTopbar();
  renderTab(activeTab);
}

function mountSidebar() {
  renderSidebar(document.getElementById('sidebar-mount'), activeTab,
    (tab) => { activeTab = tab; renderTab(tab); updateNavActive(tab); },
    handleLogout
  );
}

function mountTopbar() {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <button class="btn btn-icon btn-ghost mobile-menu-toggle" onclick="openSidebar()">☰</button>
      <div><div class="topbar-title" id="topbar-title">Platform Overview</div></div>
    </div>
    <div class="topbar-actions">
      ${store.demoMode ? '<span class="badge badge-warning">Demo Mode</span>' : ''}
      <span class="badge badge-brand">${esc((store.user?.role || 'ADMIN').replace('_', ' '))}</span>
      <div class="avatar avatar-sm">👑</div>
    </div>
  `;
}

async function renderTab(tab) {
  const content = document.getElementById('main-content');
  if (!content) return;
  const t = document.getElementById('topbar-title');
  if (t) t.textContent = TITLES[tab] || 'Admin';

  content.innerHTML = `<div class="page-enter"><p style="color:var(--color-text-muted);">Loading…</p></div>`;
  try {
    const html = await getTabContent(tab);
    // Ignore stale responses if the user switched tabs meanwhile
    if (tab !== activeTab) return;
    content.innerHTML = `<div class="page-enter">${html}</div>`;
  } catch (err) {
    if (tab !== activeTab) return;
    content.innerHTML = `<div class="alert alert-danger"><span>❌</span><div>${esc(err.message || 'Failed to load data.')}</div></div>`;
  }
}

async function getTabContent(tab) {
  if (tab === 'overview') return overviewTab();
  if (tab === 'organizations') return organizationsTab();
  if (tab === 'users') return usersTab();
  if (tab === 'verification') return verificationTab();
  if (tab === 'logistics-mgmt') return logisticsPartnersTab();
  if (tab === 'admin-mgmt') return adminMgmtTab();
  if (tab === 'ai-usage') return aiUsageTab();
  if (tab === 'audit') return auditTab();
  return pendingApiTab(tab);
}

function pendingApiTab(tab) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">🚧</div>
      <h3>${esc(TITLES[tab] || tab)}</h3>
      <p>${esc(PENDING_API[tab] || 'This section is not built yet.')}</p>
    </div>`;
}

// ── Data loaders (demo data only in demo mode) ────────────────────────────────
async function loadStats() {
  if (store.demoMode) {
    const s = demoData.adminStats;
    return { totalUsers: s.totalUsers, activeUsers: s.activeBusinesses, pendingVerification: s.pendingVerification,
      activeBusinesses: s.activeBusinesses, verifiedBusinesses: s.verifiedBusinesses, roleBreakdown: {} };
  }
  return api.getAdminStats();
}
async function loadUsers(params = {}) {
  if (store.demoMode) return { users: demoData.adminUsers };
  const clean = { limit: 100 };
  if (params.search) clean.search = params.search;
  if (params.role) clean.role = params.role;
  if (params.status) clean.status = params.status;
  return api.getUsers(clean);
}
async function loadVerifications(status = '') {
  if (store.demoMode) return [];
  return api.getVerificationQueue(status);
}
async function loadAudit() {
  if (store.demoMode) return { logs: demoData.auditLogs.map(l => ({ ...l, actor: { email: 'demo-admin' } })) };
  return api.getAuditLogs({ limit: 100 });
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
async function overviewTab() {
  const [s, vq, ul] = await Promise.all([loadStats(), loadVerifications(), loadUsers()]);
  const recent = (ul.users || []).slice(0, 5);
  const roles = s.roleBreakdown || {};

  return `
    <div class="stagger-children" style="display:flex;flex-direction:column;gap:24px;">
      <div class="alert alert-warning"><span>⚠️</span><div>
        <strong>Admin Console.</strong> Sensitive actions are written to the audit log.
        ${store.demoMode ? '<strong> Demo mode: data is not live.</strong>' : ''}
      </div></div>

      <div>
        <h2 style="font-size:var(--text-xl);font-weight:800;margin-bottom:16px;">📊 Platform Overview</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;">
          ${metric('Total Users', s.totalUsers, '👥', 'brand', 'all accounts')}
          ${metric('Active Users', s.activeUsers, '🟢', 'success', 'approved accounts')}
          ${metric('Pending Verification', s.pendingVerification, '⏳', 'warning', 'need review')}
          ${metric('Businesses', s.activeBusinesses, '🏢', 'brand', 'business profiles')}
          ${metric('Verified Businesses', s.verifiedBusinesses, '✅', 'success', 'GST verified')}
        </div>
      </div>

      ${Object.keys(roles).length ? `
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:12px;">Accounts by role</h3>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">
          ${Object.entries(roles).map(([r, n]) => `<span class="badge badge-brand">${esc(r)}: ${esc(n)}</span>`).join('')}
        </div>
      </div>` : ''}

      <div class="card-soft p-6">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="font-weight:700;">⏳ Verification Queue <span class="badge badge-warning" style="margin-left:8px;">${vq.length} pending</span></h3>
          <button class="btn btn-primary btn-sm" onclick="window.__adminNav('verification')">View All →</button>
        </div>
        ${vq.length ? verificationTable(vq.slice(0, 3)) : '<p style="color:var(--color-text-muted);">No businesses are waiting for review.</p>'}
      </div>

      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:16px;">📋 Recent Registrations</h3>
        ${recent.length ? recent.map(u => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border);">
            <div class="avatar avatar-sm">${esc((u.fullName || '?')[0])}</div>
            <div style="flex:1;">
              <div style="font-size:var(--text-sm);font-weight:600;">${esc(u.fullName)}</div>
              <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${esc(u.businessProfile?.businessName || u.email)}${u.businessProfile?.city ? ' · ' + esc(u.businessProfile.city) : ''}</div>
            </div>
            <span class="badge ${statusClass(u.status)}">${esc(u.status.replace('_', ' '))}</span>
          </div>`).join('') : '<p style="color:var(--color-text-muted);">No users yet.</p>'}
      </div>
    </div>`;
}

async function usersTab() {
  const { users = [] } = await loadUsers(userFilter);
  const me = store.user?.id;
  const roles = ['RETAILER', 'WHOLESALER', 'MANUFACTURER', 'DISTRIBUTOR', 'SUPPLIER', 'LOGISTICS', 'WORKER', 'SUPER_ADMIN', 'VERIFICATION_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN', 'LOGISTICS_ADMIN'];
  const statuses = ['ACTIVE', 'PENDING_VERIFICATION', 'NEEDS_INFO', 'ON_HOLD', 'REJECTED', 'SUSPENDED'];

  return `
    <div class="animate-fadeInUp">
      <div class="page-header" style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div><h1>👥 User Management</h1><p>${users.length} matching account(s)</p></div>
        <form onsubmit="window.__applyUserFilter(event)" style="display:flex;gap:8px;flex-wrap:wrap;">
          <input id="admin-u-search" class="input-field" placeholder="Search name or email…" value="${esc(userFilter.search)}" style="width:200px;" />
          <select id="admin-u-role" class="input-field select-field" style="width:160px;">
            <option value="">All Roles</option>
            ${roles.map((r) => `<option value="${r}" ${userFilter.role === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <select id="admin-u-status" class="input-field select-field" style="width:160px;">
            <option value="">All Statuses</option>
            ${statuses.map((st) => `<option value="${st}" ${userFilter.status === st ? 'selected' : ''}>${st.replace(/_/g, ' ')}</option>`).join('')}
          </select>
          <button type="submit" class="btn btn-primary btn-sm">Filter</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="window.__resetUserFilter()">Reset</button>
        </form>
      </div>
      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Organization</th><th>Email Ver.</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td><strong>${esc(u.fullName)}</strong>${u.workerRole ? `<div style="font-size:11px;color:var(--color-text-muted);">${esc(u.workerRole.replace(/_/g, ' '))}</div>` : ''}</td>
                <td style="color:var(--color-text-muted);">${esc(u.email)}</td>
                <td><span class="badge badge-brand">${esc(u.role)}</span></td>
                <td>${esc(u.organization?.name || u.businessProfile?.businessName || '—')}</td>
                <td><span class="badge ${u.emailVerified ? 'badge-active' : 'badge-muted'}">${u.emailVerified ? '✓ Yes' : 'No'}</span></td>
                <td><span class="badge ${statusClass(u.status)}">${esc(u.status.replace(/_/g, ' '))}</span></td>
                <td style="color:var(--color-text-muted);font-size:var(--text-xs);">${esc(fmtDate(u.createdAt))}</td>
                <td>
                  <div style="display:flex;gap:6px;">
                    <button class="btn btn-ghost btn-sm" onclick="window.__viewUserHistory('${esc(u.id)}','${esc(u.email)}')">History</button>
                    ${u.id === me ? '<span style="color:var(--color-text-muted);font-size:var(--text-xs);align-self:center;">You</span>'
                      : u.status === 'SUSPENDED'
                        ? `<button class="btn btn-ghost btn-sm" onclick="window.__setUserStatus('${esc(u.id)}','ACTIVE')">Reactivate</button>`
                        : `<button class="btn btn-danger btn-sm" onclick="window.__setUserStatus('${esc(u.id)}','SUSPENDED')">Suspend</button>`}
                  </div>
                </td>
              </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--color-text-muted);">No matching users found.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div id="admin-user-history-box" style="margin-top:16px;"></div>
    </div>`;
}

function verificationTable(list) {
  return `
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Business</th><th>Owner & Email</th><th>Type</th><th>City / GSTIN</th><th>Status</th><th>Docs</th><th>Actions</th></tr></thead>
        <tbody>
          ${list.map(v => `
            <tr>
              <td><strong>${esc(v.business?.businessName)}</strong><div style="font-size:11px;color:var(--color-text-muted);">${esc(fmtDate(v.business?.user?.createdAt))}</div></td>
              <td>
                ${esc(v.business?.user?.fullName)}
                <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${esc(v.business?.user?.email)}</div>
                <span class="badge ${v.business?.user?.emailVerified ? 'badge-active' : 'badge-muted'}" style="font-size:10px;margin-top:4px;">${v.business?.user?.emailVerified ? 'Email Verified' : 'Email Unverified'}</span>
              </td>
              <td><span class="badge badge-brand">${esc(v.business?.user?.role)}</span></td>
              <td>${esc(v.business?.city)}<div style="font-size:11px;color:var(--color-text-muted);">${esc(v.business?.gstin || 'No GSTIN')}</div></td>
              <td><span class="badge ${statusClass(v.status)}">${esc(v.status.replace(/_/g, ' '))}</span>${v.reviewerNotes ? `<div style="font-size:11px;color:var(--color-text-muted);max-width:160px;">${esc(v.reviewerNotes)}</div>` : ''}</td>
              <td>${(v.documents || []).length
                ? (v.documents || []).map(d => `<a href="/api/org/documents/${esc(d.id)}/download" target="_blank" style="display:block;font-size:var(--text-xs);color:var(--color-primary);">${esc(d.docType)}</a>`).join('')
                : '<span style="color:var(--color-text-muted);font-size:var(--text-xs);">None</span>'}</td>
              <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn btn-sm" style="background:var(--color-success-bg);color:var(--color-success);border:1px solid #A7F3D0;" onclick="window.__reviewVerification('${esc(v.id)}','approve')">✓ Approve</button>
                <button class="btn btn-ghost btn-sm" onclick="window.__reviewVerification('${esc(v.id)}','request-docs')">📎 Docs</button>
                <button class="btn btn-ghost btn-sm" onclick="window.__reviewVerification('${esc(v.id)}','hold')">⏸ Hold</button>
                <button class="btn btn-sm btn-danger" onclick="window.__reviewVerification('${esc(v.id)}','reject')">✗ Reject</button>
              </div></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function verificationTab() {
  const vq = await loadVerifications(verStatusFilter);
  return `
    <div class="animate-fadeInUp">
      <div class="page-header" style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div><h1>✅ Business Verification Center</h1><p>${vq.length} record(s) shown</p></div>
        <select onchange="window.__setVerFilter(this.value)" class="input-field select-field" style="width:220px;">
          <option value="" ${verStatusFilter === '' ? 'selected' : ''}>Action Needed (Pending / Docs / Hold)</option>
          <option value="ACTIVE" ${verStatusFilter === 'ACTIVE' ? 'selected' : ''}>Approved / Active</option>
          <option value="REJECTED" ${verStatusFilter === 'REJECTED' ? 'selected' : ''}>Rejected</option>
          <option value="ALL" ${verStatusFilter === 'ALL' ? 'selected' : ''}>All Verifications</option>
        </select>
      </div>
      ${store.demoMode ? '<div class="alert alert-info mb-4"><span>ℹ️</span><div>Demo mode has no verification queue.</div></div>' : ''}
      <div class="card-soft p-6">
        ${vq.length ? verificationTable(vq) : '<p style="color:var(--color-text-muted);">No verification records match this filter.</p>'}
      </div>
    </div>`;
}

async function organizationsTab() {
  if (store.demoMode) return `<div class="alert alert-info"><span>ℹ️</span><div>Live organizations require backend connection.</div></div>`;
  const { organizations = [] } = await api.getAdminOrganizations();
  return `
    <div class="animate-fadeInUp">
      <div class="page-header"><h1>🏢 Registered Organizations</h1><p>${organizations.length} organization(s) across Buyer, Seller, and Logistics portals</p></div>
      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Organization</th><th>Portal / Type</th><th>Location</th><th>GSTIN</th><th>Status</th><th>Team / Branches</th><th>Catalogue / Fleet</th></tr></thead>
          <tbody>
            ${organizations.map((o) => `
              <tr>
                <td><strong>${esc(o.name)}</strong><div style="font-size:11px;color:var(--color-text-muted);">${esc(o.category)}</div></td>
                <td><span class="badge badge-brand">${esc(o.portalType)} · ${esc(o.businessType)}</span></td>
                <td>${esc(o.city)}, ${esc(o.state)}</td>
                <td>${esc(o.gstin || '—')}</td>
                <td><span class="badge ${statusClass(o.verificationStatus)}">${esc(o.verificationStatus.replace(/_/g, ' '))}</span></td>
                <td>${esc(o._count?.memberships ?? 0)} members · ${esc(o._count?.branches ?? 0)} branches</td>
                <td>${o.portalType === 'LOGISTICS' ? `${esc(o._count?.vehicles ?? 0)} vehicles · ${esc(o._count?.shipments ?? 0)} shipments` : `${esc(o._count?.products ?? 0)} products`}</td>
              </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);">No organizations registered yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function logisticsPartnersTab() {
  if (store.demoMode) return `<div class="alert alert-info"><span>ℹ️</span><div>Logistics partner directory requires live backend connection.</div></div>`;
  const { partners = [] } = await api.getAdminLogisticsPartners();
  return `
    <div class="animate-fadeInUp">
      <div class="page-header"><h1>🚚 Logistics Partners</h1><p>${partners.length} registered transport & logistics company(ies)</p></div>
      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Company</th><th>Location & Regions</th><th>Verification</th><th>Vehicles</th><th>Shipments</th><th>Team</th></tr></thead>
          <tbody>
            ${partners.map((p) => `
              <tr>
                <td><strong>${esc(p.name)}</strong><div style="font-size:11px;color:var(--color-text-muted);">${esc(p.vehicleTypes || 'Fleet not specified')}</div></td>
                <td>${esc(p.city)}, ${esc(p.state)}<div style="font-size:11px;color:var(--color-text-muted);">${esc(p.operatingRegions || '—')}</div></td>
                <td><span class="badge ${statusClass(p.verificationStatus)}">${esc(p.verificationStatus.replace(/_/g, ' '))}</span></td>
                <td><strong>${esc(p._count?.vehicles ?? 0)}</strong></td>
                <td><strong>${esc(p._count?.shipments ?? 0)}</strong></td>
                <td>${esc(p._count?.memberships ?? 0)}</td>
              </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);">No logistics partners registered yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function adminMgmtTab() {
  if (store.demoMode) return `<div class="alert alert-info"><span>ℹ️</span><div>Admin staff management requires live backend connection.</div></div>`;
  const { admins = [], availableRoles = [] } = await api.getAdmins();
  const isSuper = store.user?.role === 'SUPER_ADMIN';
  const me = store.user?.id;
  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header">
        <h1>🛡️ Admin Staff Management</h1>
        <p>Create and govern administrative staff across all 6 platform admin roles. Admin accounts can never be registered publicly.</p>
      </div>

      ${isSuper ? `
        <div class="card-soft p-6">
          <h3 style="font-weight:700;margin-bottom:14px;">+ Add Administrative Staff</h3>
          <form onsubmit="window.__createAdminStaff(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end;">
            <div>
              <label class="form-label">Full Name *</label>
              <input id="na-name" class="input-field" placeholder="Admin full name" required />
            </div>
            <div>
              <label class="form-label">Official Email *</label>
              <input id="na-email" type="email" class="input-field" placeholder="staff@sahayak.in" required />
            </div>
            <div>
              <label class="form-label">Initial Password (min 8) *</label>
              <input id="na-pass" type="password" class="input-field" minlength="8" placeholder="••••••••" required />
            </div>
            <div>
              <label class="form-label">Admin Role *</label>
              <select id="na-role" class="input-field select-field" required>
                ${availableRoles.map((r) => `<option value="${r}">${r.replace(/_/g, ' ')}</option>`).join('')}
              </select>
            </div>
            <button type="submit" class="btn btn-primary">Create Admin</button>
          </form>
        </div>
      ` : `<div class="alert alert-info"><span>🔒</span><div>Only Super Admins can create or change administrative staff roles.</div></div>`}

      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            ${admins.map((a) => `
              <tr>
                <td><strong>${esc(a.fullName)}</strong></td>
                <td style="color:var(--color-text-muted);">${esc(a.email)}</td>
                <td>
                  ${isSuper && a.id !== me ? `
                    <select onchange="window.__changeAdminRole('${esc(a.id)}', this.value)" class="input-field select-field" style="width:190px;padding:4px 8px;font-size:var(--text-xs);">
                      ${availableRoles.map((r) => `<option value="${r}" ${a.role === r ? 'selected' : ''}>${r.replace(/_/g, ' ')}</option>`).join('')}
                    </select>
                  ` : `<span class="badge badge-brand">${esc(a.role.replace(/_/g, ' '))}</span>`}
                </td>
                <td><span class="badge ${statusClass(a.status)}">${esc(a.status)}</span></td>
                <td style="font-size:var(--text-xs);color:var(--color-text-muted);">${esc(fmtDate(a.createdAt))}</td>
                <td>
                  ${a.id === me ? '<span style="font-size:var(--text-xs);color:var(--color-text-muted);">You</span>'
                    : isSuper ? (a.status === 'SUSPENDED'
                      ? `<button class="btn btn-ghost btn-sm" onclick="window.__setUserStatus('${esc(a.id)}','ACTIVE')">Reactivate</button>`
                      : `<button class="btn btn-danger btn-sm" onclick="window.__setUserStatus('${esc(a.id)}','SUSPENDED')">Suspend</button>`) : '—'}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function aiUsageTab() {
  if (store.demoMode) {
    return `<div class="alert alert-info"><span>ℹ️</span><div>AI health monitoring requires a live backend connection.</div></div>`;
  }
  const d = await api.getAdminAiUsage();
  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header"><h1>🤖 Platform Health & AI Monitoring</h1><p>Real Gemini API request counts, token usage, failures, and latency</p></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;">
        ${metric('Total AI Requests', d.totalRequests, '🤖', 'brand', `Model: ${d.model}`)}
        ${metric('Failed Requests', d.failedRequests, '⚠️', d.failedRequests > 0 ? 'warning' : 'success', d.geminiConfigured ? 'Key configured' : 'Key missing')}
        ${metric('Total Tokens', d.totalTokens, '🔢', 'brand', `In: ${d.promptTokens} / Out: ${d.completionTokens}`)}
        ${metric('Avg Latency (ms)', d.avgLatencyMs, '⏱️', '', 'Backend to Gemini')}
      </div>
      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Time</th><th>User</th><th>Role</th><th>Model</th><th>Tokens</th><th>Latency</th><th>Status</th></tr></thead>
          <tbody>
            ${(d.recent || []).map(r => `
              <tr>
                <td style="font-size:var(--text-xs);">${esc(fmtDate(r.createdAt))}</td>
                <td>${esc(r.user?.email || r.userId)}</td>
                <td><span class="badge badge-brand">${esc(r.user?.role || '—')}</span></td>
                <td>${esc(r.model)}</td>
                <td>${esc(r.totalTokens)}</td>
                <td>${r.latencyMs != null ? esc(r.latencyMs) + ' ms' : '—'}</td>
                <td><span class="badge ${r.success ? 'badge-active' : 'badge-rejected'}">${r.success ? 'OK' : esc(r.errorCode || 'ERROR')}</span></td>
              </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);">No AI requests logged yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function auditTab() {
  const { logs = [] } = await loadAudit();
  return `
    <div class="animate-fadeInUp">
      <div class="page-header"><h1>📋 Audit Logs</h1><p>Tamper-evident log of sensitive admin operations (SHA-256 hash chain)</p></div>
      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Timestamp</th><th>Action</th><th>Target</th><th>Actor</th><th>Details</th></tr></thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td style="font-size:var(--text-xs);">${esc(fmtDate(l.createdAt))}</td>
                <td><span class="badge badge-brand">${esc(l.action)}</span></td>
                <td>${esc(l.targetEntity)}</td>
                <td style="color:var(--color-text-muted);">${esc(l.actor?.email || l.actorId)}</td>
                <td style="font-size:var(--text-xs);color:var(--color-text-muted);">${esc(l.details ? JSON.stringify(l.details) : '')}</td>
              </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);">No audit entries yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

function metric(label, value, icon, colorClass, sub) {
  return `
    <div class="card-metric">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div class="metric-label">${esc(label)}</div><span style="font-size:22px;">${icon}</span>
      </div>
      <div class="metric-value ${colorClass}">${esc(Number(value ?? 0).toLocaleString())}</div>
      <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:6px;">${esc(sub)}</div>
    </div>`;
}

function renderMobileNav() {
  return `
    <div class="mobile-nav"><div class="mobile-nav-items">
      ${[['🖥️', 'Overview', 'overview'], ['👥', 'Users', 'users'], ['✅', 'Verify', 'verification'], ['📋', 'Audit', 'audit']].map(([icon, label, tab]) => `
        <button class="mobile-nav-item" onclick="window.__sidebarNav('${tab}')">
          <span class="mobile-nav-icon">${icon}</span><span>${label}</span>
        </button>`).join('')}
    </div></div>`;
}

function updateNavActive(tab) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`nav-${tab}`);
  if (target) target.classList.add('active');
}

async function handleLogout() {
  try { await api.logout(); } catch {}
  persistUser(null);
  setState({ user: null });
  navigate('/');
}

// ── Actions (real API calls) ──────────────────────────────────────────────────
window.__reviewVerification = async (id, decision) => {
  if (store.demoMode) return showToast('Demo mode: no live data to change.', 'warning');
  const prompts = {
    approve: 'Approval notes (optional):',
    reject: 'Reason for rejection (shown to the business):',
    'request-docs': 'Which additional documents or clarifications are needed?',
    hold: 'Reason for placing verification on hold:'
  };
  const notes = window.prompt(prompts[decision] || 'Notes:');
  if (notes === null) return;
  try {
    if (decision === 'approve') await api.approveVerification(id, notes);
    else if (decision === 'request-docs') await api.requestVerificationDocs(id, notes);
    else if (decision === 'hold') await api.holdVerification(id, notes);
    else await api.rejectVerification(id, notes);
    showToast(`Verification updated (${decision})`, decision === 'approve' ? 'success' : 'info');
    renderTab(activeTab);
  } catch (err) {
    showToast(err.message || 'Action failed', 'error');
  }
};

window.__setUserStatus = async (id, status) => {
  if (store.demoMode) return showToast('Demo mode: no live data to change.', 'warning');
  const reason = status === 'SUSPENDED' ? window.prompt('Reason for suspension:') : '';
  if (reason === null) return;
  try {
    await api.setUserStatus(id, status, reason);
    showToast(status === 'SUSPENDED' ? 'User suspended' : 'User reactivated', 'success');
    renderTab(activeTab);
  } catch (err) {
    showToast(err.message || 'Action failed', 'error');
  }
};

window.showToast = showToast;
window.__adminNav = (tab) => { activeTab = tab; renderTab(tab); updateNavActive(tab); };
window.__applyUserFilter = (e) => {
  e.preventDefault();
  userFilter = {
    search: document.getElementById('admin-u-search')?.value.trim() || '',
    role: document.getElementById('admin-u-role')?.value || '',
    status: document.getElementById('admin-u-status')?.value || ''
  };
  renderTab('users');
};
window.__resetUserFilter = () => {
  userFilter = { search: '', role: '', status: '' };
  renderTab('users');
};
window.__setVerFilter = (val) => {
  verStatusFilter = val;
  renderTab('verification');
};
window.__createAdminStaff = async (e) => {
  e.preventDefault();
  try {
    await api.createAdmin({
      fullName: document.getElementById('na-name')?.value.trim(),
      email: document.getElementById('na-email')?.value.trim(),
      password: document.getElementById('na-pass')?.value,
      role: document.getElementById('na-role')?.value
    });
    showToast('Admin staff account created!', 'success');
    renderTab('admin-mgmt');
  } catch (err) {
    showToast(err.message || 'Failed to create admin staff.', 'error');
  }
};
window.__changeAdminRole = async (id, role) => {
  try {
    await api.updateAdminRole(id, role);
    showToast(`Admin role updated to ${role.replace(/_/g, ' ')}`, 'success');
    renderTab('admin-mgmt');
  } catch (err) {
    showToast(err.message || 'Failed to update admin role.', 'error');
    renderTab('admin-mgmt');
  }
};
window.__viewUserHistory = async (userId, email) => {
  const box = document.getElementById('admin-user-history-box');
  if (!box) return;
  box.innerHTML = `<div class="card-soft p-5"><p style="color:var(--color-text-muted);">Loading login history for ${esc(email)}…</p></div>`;
  try {
    const { history = [] } = await api.getUserLoginHistory(userId);
    box.innerHTML = `
      <div class="card-soft p-5">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="font-weight:700;">🔐 Login & Security History — ${esc(email)}</h3>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('admin-user-history-box').innerHTML=''">✕ Close</button>
        </div>
        ${history.length ? `<table class="data-table"><thead><tr><th>Time</th><th>Method</th><th>Result</th><th>IP</th><th>Reason</th></tr></thead><tbody>
          ${history.map((h) => `<tr><td>${esc(fmtDate(h.createdAt))}</td><td>${esc(h.method)}</td><td><span class="badge ${h.success ? 'badge-active' : 'badge-rejected'}">${h.success ? 'Success' : 'Failed'}</span></td><td>${esc(h.ipAddress || '—')}</td><td>${esc(h.failureReason || '—')}</td></tr>`).join('')}
        </tbody></table>` : '<p style="color:var(--color-text-muted);font-size:var(--text-sm);">No login events recorded for this user yet.</p>'}
      </div>`;
  } catch (err) {
    box.innerHTML = `<div class="alert alert-danger"><span>❌</span><div>${esc(err.message || 'Could not load history.')}</div></div>`;
  }
};
