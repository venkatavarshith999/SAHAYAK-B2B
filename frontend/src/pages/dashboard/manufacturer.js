/**
 * SAHAYAK B2B — Manufacturer / Company Dashboard
 */

import { store, setState, persistUser } from '../../store.js';
import { api, demoData } from '../../api.js';
import { renderSidebar } from '../../components/sidebar.js';
import { AICopilot } from '../../components/ai-copilot.js';
import { showToast } from '../../components/toast.js';
import { navigate } from '../../router.js';

let activeTab = 'overview';
let copilot = null;

export default function renderManufacturerDashboard(container) {
  container.innerHTML = `
    <div class="dashboard-layout dashboard-with-copilot">
      <div id="sidebar-mount"></div>
      <div class="dashboard-main">
        <div class="topbar" id="topbar"></div>
        <div class="dashboard-content" id="main-content"></div>
      </div>
      <div id="copilot-mount"></div>
    </div>
    ${renderMobileNav()}
  `;
  mountSidebar();
  mountTopbar();
  mountCopilot();
  renderTab(activeTab);
}

function mountSidebar() {
  renderSidebar(document.getElementById('sidebar-mount'), activeTab,
    (tab) => { activeTab = tab; renderTab(tab); updateNavActive(tab); },
    handleLogout
  );
}

function mountTopbar() {
  const user = store.user;
  const bar = document.getElementById('topbar');
  if (!bar) return;
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <button class="btn btn-icon btn-ghost" onclick="openSidebar()">☰</button>
      <div class="topbar-title" id="topbar-title">Manufacturer Dashboard</div>
    </div>
    <div class="topbar-actions">
      ${store.demoMode ? '<span class="badge badge-warning">Demo Mode</span>' : ''}
      <div class="avatar avatar-sm">${getInitials(user?.fullName)}</div>
    </div>
  `;
}

function mountCopilot() {
  copilot = new AICopilot(document.getElementById('copilot-mount'));
}

function renderTab(tab) {
  const content = document.getElementById('main-content');
  if (!content) return;
  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) topbarTitle.textContent = { overview: 'Manufacturer Dashboard', capacity: 'Production Capacity', catalogue: 'Product Catalogue', distributors: 'Distributor Connections', rfq: 'Purchase Enquiries', quotations: 'Quotation Management', orders: 'Bulk Orders', agreements: 'Supply Agreements', analytics: 'Analytics', profile: 'Company Profile', fulfilment: 'Production & Fulfilment', settings: 'Settings' }[tab] || 'Dashboard';
  content.innerHTML = `<div class="page-enter">${getTabContent(tab)}</div>`;
}

function getTabContent(tab) {
  const m = demoData.manufacturerMetrics;
  const user = store.user;
  const firstName = user?.fullName?.split(' ')[0] || 'there';

  if (tab === 'overview') return `
    <div class="stagger-children" style="display:flex;flex-direction:column;gap:24px;">
      <!-- Hero -->
      <div class="card-primary p-6" style="border-radius:var(--radius-2xl);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
          <div>
            <div style="font-size:var(--text-xs);font-weight:700;opacity:0.75;text-transform:uppercase;letter-spacing:0.08em;">Manufacturing Operations</div>
            <h1 style="font-size:var(--text-3xl);font-weight:900;color:white;letter-spacing:-0.03em;margin:8px 0;">${user?.businessProfile?.businessName}</h1>
            <p style="color:rgba(255,255,255,0.8);font-size:var(--text-sm);">${user?.businessProfile?.city}, ${user?.businessProfile?.state} · ${user?.businessProfile?.category}</p>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <div style="background:rgba(255,255,255,0.15);padding:12px 20px;border-radius:var(--radius-lg);text-align:center;">
              <div style="font-size:var(--text-2xl);font-weight:900;color:white;">${m.monthlyOutput}</div>
              <div style="font-size:var(--text-xs);color:rgba(255,255,255,0.7);">Monthly Output</div>
            </div>
            <div style="background:rgba(255,255,255,0.15);padding:12px 20px;border-radius:var(--radius-lg);text-align:center;">
              <div style="font-size:var(--text-2xl);font-weight:900;color:white;">${m.productionCapacity}</div>
              <div style="font-size:var(--text-xs);color:rgba(255,255,255,0.7);">Capacity Used</div>
            </div>
          </div>
        </div>
      </div>

      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
        ${renderMetric('Active Orders', m.activeOrders, '🛒', 'brand', 'in production')}
        ${renderMetric('Pending RFQs', m.pendingRFQs, '📋', 'warning', 'need response')}
        ${renderMetric('Distributor Connections', m.distributorConnections, '🌐', 'success', 'active partners')}
        ${renderMetric('Supply Agreements', m.supplyAgreements, '📜', 'brand', 'active contracts')}
        ${renderMetric('Production Capacity', m.productionCapacity, '⚙️', '', 'utilization')}
        ${renderMetric('Monthly Output', m.monthlyOutput, '📦', 'success', 'gross revenue')}
      </div>

      <!-- Active Bulk Orders -->
      <div class="card-soft p-6">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="font-weight:700;">🛒 Active Bulk Orders</h3>
          <button class="btn btn-ghost btn-sm" onclick="window.__sidebarNav('orders')">View All</button>
        </div>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead><tr><th>Order ID</th><th>Buyer</th><th>Product</th><th>Quantity</th><th>Value</th><th>Status</th><th>Deadline</th></tr></thead>
            <tbody>
              ${demoData.manufacturerOrders.map(o => `
                <tr>
                  <td><strong>${o.id}</strong></td>
                  <td>${o.buyer}</td>
                  <td>${o.product}</td>
                  <td>${o.quantity}</td>
                  <td style="font-weight:700;">${o.amount}</td>
                  <td><span class="badge ${o.status === 'Completed' ? 'badge-active' : o.status === 'Dispatched' ? 'badge-info' : 'badge-brand'}">${o.status}</span></td>
                  <td style="color:var(--color-text-muted);">${o.deadline}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Production Capacity Gauge -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="card-soft p-6">
          <h3 style="font-weight:700;margin-bottom:16px;">⚙️ Production Capacity</h3>
          <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:var(--text-sm);">Current Utilization</span>
            <span style="font-weight:800;color:var(--color-primary);">${m.productionCapacity}</span>
          </div>
          <div class="progress-bar" style="height:12px;margin-bottom:12px;">
            <div class="progress-fill" style="width:${m.productionCapacity};background:var(--grad-primary);"></div>
          </div>
          <div style="font-size:var(--text-xs);color:var(--color-text-muted);">Available capacity: ${100 - parseInt(m.productionCapacity)}% (${(100-parseInt(m.productionCapacity)) * 50} units/month)</div>
          <button class="btn btn-secondary btn-sm btn-full" style="margin-top:16px;" onclick="window.__askCopilot('How can I optimize my production capacity?')">
            🤖 Get AI Recommendations
          </button>
        </div>
        <div class="card-soft p-6">
          <h3 style="font-weight:700;margin-bottom:16px;">🌐 Distributor Network</h3>
          ${['Sunrise Distributors — Hyderabad', 'Metro Distribution — Mumbai', 'Pradesh Traders — Delhi', 'Coastal Wholesale — Chennai'].map((d, i) => `
            <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--color-border);">
              <div class="avatar avatar-sm" style="font-size:12px;">${String.fromCharCode(65+i)}</div>
              <div style="font-size:var(--text-sm);">${d}</div>
              <span class="badge badge-active" style="margin-left:auto;">Active</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  if (tab === 'capacity') return `
    <div class="animate-fadeInUp">
      <div class="page-header"><h1>⚙️ Production Capacity</h1><p>Monitor and manage your manufacturing capacity</p></div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;">
        ${['Cotton Fabrics', 'Linen Fabrics', 'Synthetic Blends', 'School Uniforms'].map((line, i) => {
          const utilizations = [78, 65, 45, 92];
          const u = utilizations[i];
          return `
            <div class="card-soft p-5">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h4 style="font-weight:700;">${line}</h4>
                <span style="font-weight:800;color:${u > 85 ? 'var(--color-warning)' : 'var(--color-primary)'};">${u}%</span>
              </div>
              <div class="progress-bar" style="height:10px;margin-bottom:8px;">
                <div class="progress-fill" style="width:${u}%;background:${u > 85 ? 'linear-gradient(90deg,#D97706,#F59E0B)' : 'var(--grad-primary)'};"></div>
              </div>
              <div style="font-size:var(--text-xs);color:var(--color-text-muted);">Available: ${100-u}% free capacity</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  if (tab === 'profile') return renderProfileTab();

  return `<div class="empty-state"><div class="empty-state-icon">🚧</div><h3>${tab}</h3><p>Backend API integration required.</p></div>`;
}

function renderMetric(label, value, icon, colorClass, sub) {
  return `
    <div class="card-metric">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div class="metric-label">${label}</div>
        <span style="font-size:22px;">${icon}</span>
      </div>
      <div class="metric-value ${colorClass}">${value}</div>
      <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:6px;">${sub}</div>
    </div>
  `;
}

function renderProfileTab() {
  const user = store.user;
  const bp = user?.businessProfile || {};
  return `
    <div class="animate-fadeInUp" style="max-width:720px;">
      <div class="page-header"><h1>🏢 Company Profile</h1></div>
      <div class="card-soft p-6">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
          <div class="avatar avatar-xl">${getInitials(user?.fullName)}</div>
          <div>
            <h2 style="font-size:var(--text-xl);font-weight:800;">${bp.businessName || 'Company Name'}</h2>
            <p style="color:var(--color-text-muted);">${user?.email}</p>
            <span class="badge badge-active" style="margin-top:6px;">GST Verified Manufacturer</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderMobileNav() {
  return `
    <div class="mobile-nav">
      <div class="mobile-nav-items">
        ${[['🏭','Overview','overview'],['⚙️','Capacity','capacity'],['📦','Catalogue','catalogue'],['🌐','Network','distributors'],['📋','RFQs','rfq']].map(([icon,label,tab]) => `
          <button class="mobile-nav-item" onclick="window.__sidebarNav('${tab}')">
            <span class="mobile-nav-icon">${icon}</span>
            <span>${label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
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

function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

window.showToast = showToast;
window.__askCopilot = (text) => { if (copilot) copilot.sendMessage(text); };
