/**
 * SAHAYAK B2B — Wholesaler / Seller Dashboard
 */

import { store, setState, persistUser } from '../../store.js';
import { api, demoData } from '../../api.js';
import { renderSidebar } from '../../components/sidebar.js';
import { AICopilot } from '../../components/ai-copilot.js';
import { KaenRoom } from '../../components/kaen-room.js';
import { showToast } from '../../components/toast.js';
import { navigate } from '../../router.js';

let activeTab = 'overview';
let copilot = null;

export default function renderWholesalerDashboard(container) {
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
      <div class="topbar-title" id="topbar-title">Seller Dashboard</div>
    </div>
    <div class="topbar-actions">
      ${store.demoMode ? '<span class="badge badge-warning" style="font-size:11px;">Demo Mode</span>' : ''}
      <button class="btn btn-primary btn-sm" onclick="showToast('New product listing — backend required','info')">+ Add Product</button>
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
  const titles = { overview: 'Seller Dashboard', kaen: 'AI Negotiation Room', catalogue: 'Product Catalogue', inventory: 'Inventory & Stock', pricing: 'Pricing & Bulk Tiers', enquiries: 'Buyer Enquiries', rfq: 'RFQ Management', quotations: 'Quotations Sent', orders: 'Order Management', analytics: 'Revenue Analytics', customers: 'Repeat Customers', profile: 'Business Profile', settings: 'Settings' };
  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) topbarTitle.textContent = titles[tab] || 'Dashboard';
  content.innerHTML = `<div class="page-enter">${getTabContent(tab)}</div>`;
  if (tab === 'kaen') new KaenRoom(document.getElementById('kaen-mount'));
}

function getTabContent(tab) {
  const m = demoData.wholesalerMetrics;
  const user = store.user;
  const firstName = user?.fullName?.split(' ')[0] || 'there';

  if (tab === 'overview') return `
    <div class="stagger-children" style="display:flex;flex-direction:column;gap:24px;">
      <!-- Hero Card -->
      <div class="card-primary p-6" style="border-radius:var(--radius-2xl);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
          <div>
            <div style="font-size:var(--text-xs);font-weight:700;opacity:0.75;text-transform:uppercase;letter-spacing:0.08em;">
              Business Overview
            </div>
            <h1 style="font-size:var(--text-3xl);font-weight:900;color:white;letter-spacing:-0.03em;margin:8px 0;">
              Hello, ${firstName}! 👋
            </h1>
            <p style="color:rgba(255,255,255,0.8);font-size:var(--text-sm);">
              ${user?.businessProfile?.businessName} · ${user?.businessProfile?.city}
            </p>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <div style="background:rgba(255,255,255,0.15);padding:12px 20px;border-radius:var(--radius-lg);text-align:center;">
              <div style="font-size:var(--text-2xl);font-weight:900;color:white;">${m.monthlyRevenue}</div>
              <div style="font-size:var(--text-xs);color:rgba(255,255,255,0.7);">Revenue (MTD)</div>
            </div>
            <div style="background:rgba(255,255,255,0.15);padding:12px 20px;border-radius:var(--radius-lg);text-align:center;">
              <div style="font-size:var(--text-2xl);font-weight:900;color:white;">${m.ordersThisMonth}</div>
              <div style="font-size:var(--text-xs);color:rgba(255,255,255,0.7);">Orders (MTD)</div>
            </div>
          </div>
        </div>
      </div>

      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;" class="lg\\:grid-3">
        ${renderMetric('Active Listings', m.activeListings, '📦', 'brand', 'products live')}
        ${renderMetric('Pending Enquiries', m.pendingEnquiries, '📬', 'warning', 'need response')}
        ${renderMetric('Pending Quotations', m.pendingQuotations, '📄', 'brand', 'quotes to send')}
        ${renderMetric('Repeat Buyers', m.repeatBuyers, '👥', 'success', 'loyal customers')}
        ${renderMetric('Orders This Month', m.ordersThisMonth, '🛒', '', 'total orders')}
        ${renderMetric('Monthly Revenue', m.monthlyRevenue, '💰', 'success', 'gross revenue')}
      </div>

      <!-- Buyer Enquiries -->
      <div class="card-soft p-6">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="font-weight:700;">📬 Recent Buyer Enquiries</h3>
          <span class="badge badge-warning">${m.pendingEnquiries} Pending</span>
        </div>
        ${[
          { buyer: 'Arjun Textiles', product: 'Cotton School Shirts × 500', date: '2 hrs ago', value: '₹1.2L', urgent: true },
          { buyer: 'Metro Retail', product: 'Linen Fabric × 1,000m', date: '5 hrs ago', value: '₹65,000', urgent: false },
          { buyer: 'Sunrise Traders', product: 'Stationery Bulk Pack × 200', date: '1 day ago', value: '₹28,000', urgent: false },
        ].map(e => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--color-border);">
            <div class="avatar avatar-sm">${e.buyer[0]}</div>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:var(--text-sm);">${e.buyer} ${e.urgent ? '<span class="badge badge-pending">Urgent</span>' : ''}</div>
              <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${e.product} · ${e.date}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:700;">${e.value}</div>
              <button class="btn btn-secondary btn-sm" onclick="showToast('Quotation feature requires backend','info')">Send Quote</button>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- AI Negotiation Helper -->
      <div class="card-soft p-6">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="width:48px;height:48px;border-radius:var(--radius-md);background:var(--grad-primary);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">🤖</div>
          <div style="flex:1;">
            <h3 style="font-weight:700;margin-bottom:4px;">AI Negotiation Assistant</h3>
            <p style="font-size:var(--text-xs);color:var(--color-text-muted);">Get help with pricing strategy, RFQ responses, and bulk deal structuring</p>
          </div>
          <button class="btn btn-primary" onclick="window.__sidebarNav('kaen')">Open KAEN Room →</button>
        </div>
      </div>
    </div>
  `;

  if (tab === 'kaen') return `<div id="kaen-mount"></div>`;

  if (tab === 'catalogue') return `
    <div class="animate-fadeInUp">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div><h1>📦 Product Catalogue</h1><p>Manage your product listings, descriptions and pricing</p></div>
        <button class="btn btn-primary" onclick="showToast('Product management requires backend','info')">+ New Product</button>
      </div>
      <div class="alert alert-info mb-4"><span>ℹ️</span><div>Product catalogue management requires the backend database. <strong>Demo listing shown below.</strong></div></div>
      <div class="card-soft p-0" style="overflow:hidden;">
        <table class="data-table">
          <thead><tr><th>Product</th><th>Category</th><th>Unit Price</th><th>Bulk Price (100+)</th><th>Stock</th><th>Status</th></tr></thead>
          <tbody>
            ${[
              ['Cotton School Shirt', 'Apparel', '₹280', '₹260', '1,240 units', 'ACTIVE'],
              ['Linen Fabric (metre)', 'Fabrics', '₹140', '₹125', '8,500 m', 'ACTIVE'],
              ['Steel Water Bottle', 'Kitchenware', '₹145', '₹130', '450 units', 'LOW_STOCK'],
              ['Canvas Backpack', 'Accessories', '₹480', '₹440', '0 units', 'OUT_OF_STOCK'],
            ].map(([name, cat, up, bp, stock, st]) => `
              <tr>
                <td><strong>${name}</strong></td>
                <td>${cat}</td>
                <td>${up}</td>
                <td style="color:var(--color-success);font-weight:600;">${bp}</td>
                <td>${stock}</td>
                <td><span class="badge ${st === 'ACTIVE' ? 'badge-active' : st === 'LOW_STOCK' ? 'badge-warning' : 'badge-pending'}">${st.replace('_',' ')}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (tab === 'analytics') return `
    <div class="animate-fadeInUp">
      <div class="page-header"><h1>📈 Revenue Analytics</h1></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;">
        ${renderMetric('This Month', '₹18.6L', '💰', 'success', '+12% vs last month')}
        ${renderMetric('Q4 Total', '₹52.3L', '📊', 'brand', 'Oct – Dec 2026')}
        ${renderMetric('Avg Order Value', '₹19,787', '🛒', '', 'per transaction')}
      </div>
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:16px;">Monthly Revenue Trend (Demo)</h3>
        ${renderBarChart()}
      </div>
    </div>
  `;

  if (tab === 'profile') return renderProfileTab();

  return `<div class="empty-state"><div class="empty-state-icon">🚧</div><h3>${tab}</h3><p>Backend API integration required for this section.</p></div>`;
}

function renderBarChart() {
  const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  const values = [12.1, 14.3, 16.8, 15.2, 17.4, 18.6];
  const max = Math.max(...values);
  return `
    <div style="display:flex;align-items:flex-end;gap:16px;height:140px;">
      ${months.map((m, i) => `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--color-primary);">₹${values[i]}L</div>
          <div style="flex:1;width:100%;background:var(--grad-primary);border-radius:6px 6px 0 0;min-height:4px;height:${(values[i]/max)*100}%;opacity:${i === months.length-1 ? 1 : 0.6};transition:height 0.5s ease;" class="animate-fadeInUp" style="animation-delay:${i*60}ms;"></div>
          <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${m}</div>
        </div>
      `).join('')}
    </div>
    <div class="alert alert-info" style="margin-top:16px;"><span>ℹ️</span><div style="font-size:var(--text-xs);">Chart shows demo data. Real analytics require database connection.</div></div>
  `;
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
      <div class="page-header"><h1>🏢 Business Profile</h1></div>
      <div class="card-soft p-6">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
          <div class="avatar avatar-xl">${getInitials(user?.fullName)}</div>
          <div>
            <h2 style="font-size:var(--text-xl);font-weight:800;">${bp.businessName || 'Business Name'}</h2>
            <p style="color:var(--color-text-muted);font-size:var(--text-sm);">${user?.email}</p>
            <span class="badge ${user?.status === 'ACTIVE' ? 'badge-active' : 'badge-pending'}" style="margin-top:6px;">${user?.status?.replace('_',' ') || 'Unknown'}</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          ${[['Owner Name', user?.fullName], ['Email', user?.email], ['Phone', user?.phone || '—'], ['City', bp.city || '—'], ['State', bp.state || '—'], ['Category', bp.category || '—']].map(([l,v]) => `
            <div>
              <div class="form-label">${l}</div>
              <div style="font-weight:600;">${v}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderMobileNav() {
  return `
    <div class="mobile-nav">
      <div class="mobile-nav-items">
        ${[['📊','Overview','overview'],['🤝','Negotiate','kaen'],['📦','Catalogue','catalogue'],['📬','Enquiries','enquiries'],['📈','Analytics','analytics']].map(([icon,label,tab]) => `
          <button class="mobile-nav-item ${activeTab === tab ? 'active' : ''}" onclick="window.__sidebarNav('${tab}')">
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
