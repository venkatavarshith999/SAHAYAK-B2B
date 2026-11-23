/**
 * SAHAYAK B2B — Live Transport & Logistics Portal
 * Backed 100% by PostgreSQL APIs (/api/logistics/* and /api/org/*).
 * Shipments & structured lifecycle tracking (with POD), Fleet & Vehicles, Drivers & Team, Branches, Docs.
 */

import { store, setState, persistUser } from '../../store.js';
import { api } from '../../api.js';
import { renderSidebar } from '../../components/sidebar.js';
import { AICopilot } from '../../components/ai-copilot.js';
import {
  renderOrgProfileAndBranches,
  renderTeamManagement,
  renderVerificationDocuments
} from '../../components/org-management.js';
import { renderPartnershipsPanel } from '../../components/partnerships-panel.js';
import { renderB2bChatPanel, stopB2bChatPolling } from '../../components/b2b-chat.js';
import { showToast } from '../../components/toast.js';
import { navigate } from '../../router.js';
import { esc } from '../../utils/sanitize.js';

let activeTab = 'overview';

const SHIPMENT_STATUSES = [
  'CREATED', 'AWAITING_ACCEPTANCE', 'ACCEPTED', 'PICKUP_SCHEDULED',
  'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'
];

const TITLES = {
  overview: 'Logistics Overview',
  shipments: 'Shipments & Tracking',
  fleet: 'Fleet & Vehicles',
  partnerships: 'Logistics Partnerships',
  chat: 'B2B Business Chat',
  team: 'Drivers & Workforce',
  branches: 'Company Profile & Branches',
  documents: 'Verification Documents'
};

export default function renderLogisticsDashboard(container) {
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
      ${[['🚚', 'Overview', 'overview'], ['📦', 'Shipments', 'shipments'], ['🚛', 'Fleet', 'fleet'], ['👷', 'Drivers', 'team']].map(([icon, label, tab]) => `
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
      <div class="topbar-title" id="topbar-title">Logistics Overview</div>
    </div>
    <div class="topbar-actions">
      ${store.demoMode ? '<span class="badge badge-warning">Demo Mode</span>' : ''}
      <span class="badge badge-brand">TRANSPORT & LOGISTICS</span>
      <div class="avatar avatar-sm">${esc((user?.fullName || 'L')[0].toUpperCase())}</div>
    </div>
  `;
}

async function renderTab(tab) {
  const content = document.getElementById('main-content');
  if (!content) return;
  const t = document.getElementById('topbar-title');
  if (t) t.textContent = TITLES[tab] || 'Logistics Portal';

  if (tab !== 'chat') stopB2bChatPolling();
  content.innerHTML = `<div class="page-enter"><p style="color:var(--color-text-muted);">Loading…</p></div>`;
  try {
    let html = '';
    const refresh = () => renderTab(tab);
    if (tab === 'overview') html = await overviewTab();
    else if (tab === 'shipments') html = await shipmentsTab();
    else if (tab === 'fleet') html = await fleetTab();
    else if (tab === 'partnerships') html = await renderPartnershipsPanel(refresh);
    else if (tab === 'chat') html = await renderB2bChatPanel(refresh);
    else if (tab === 'team') html = await renderTeamManagement(refresh);
    else if (tab === 'branches') html = await renderOrgProfileAndBranches(refresh);
    else if (tab === 'documents') html = await renderVerificationDocuments(refresh);

    if (tab !== activeTab) return;
    content.innerHTML = `<div class="page-enter">${html}</div>`;
  } catch (err) {
    if (tab !== activeTab) return;
    content.innerHTML = `<div class="alert alert-danger"><span>❌</span><div>${esc(err.message || 'Failed to load logistics data.')}</div></div>`;
  }
}

async function overviewTab() {
  const d = await api.getLogisticsOverview();
  const s = d.stats;
  return `
    <div class="stagger-children" style="display:flex;flex-direction:column;gap:20px;">
      <div class="card-soft p-6" style="background:var(--grad-soft);border:1px solid var(--color-brand-200,#ddd6fe);">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
          <div>
            <span class="badge badge-brand">TRANSPORT & LOGISTICS PORTAL</span>
            <h1 style="font-size:var(--text-2xl);font-weight:900;margin-top:8px;">${esc(d.organizationName)}</h1>
            <p style="font-size:var(--text-sm);color:var(--color-text-secondary);margin-top:4px;">
              Manage B2B shipments, vehicle fleet, driver assignments, and structured proof-of-delivery tracking.
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" onclick="window.__sidebarNav('shipments')">+ Create Shipment</button>
            <button class="btn btn-ghost btn-sm" onclick="window.__sidebarNav('fleet')">🚛 Manage Fleet</button>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:14px;">
        ${metric('Total Shipments', s.totalShipments, '📦', 'brand', `${s.pendingRequests} awaiting · ${s.inTransit} in transit`)}
        ${metric('Delivered', s.delivered, '✅', 'success', s.deliverySuccessRate != null ? `${s.deliverySuccessRate}% success rate` : 'no completed trips yet')}
        ${metric('Available Vehicles', `${s.availableVehicles} / ${s.totalVehicles}`, '🚛', 'brand', 'ready for dispatch')}
        ${metric('Active Drivers', s.activeDrivers, '👷', 'success', `${s.teamMembers} total team · ${s.branches} branches`)}
      </div>
    </div>`;
}

async function shipmentsTab() {
  const [{ shipments = [] }, { vehicles = [] }, { members = [] }] = await Promise.all([
    api.getShipments(),
    api.getVehicles().catch(() => ({ vehicles: [] })),
    api.getOrgMembers().catch(() => ({ members: [] }))
  ]);

  const drivers = members.filter((m) => m.workerRole === 'DRIVER' || m.isOwner);

  window.__createShipment = async (e) => {
    e.preventDefault();
    try {
      await api.createShipment({
        clientName: document.getElementById('sh-client')?.value.trim(),
        originCity: document.getElementById('sh-origin')?.value.trim(),
        destinationCity: document.getElementById('sh-dest')?.value.trim(),
        weightKg: Number(document.getElementById('sh-weight')?.value),
        quotedAmount: document.getElementById('sh-quote')?.value ? Number(document.getElementById('sh-quote')?.value) : null,
        vehicleId: document.getElementById('sh-veh')?.value || null,
        driverUserId: document.getElementById('sh-drv')?.value || null,
        pickupDate: document.getElementById('sh-pickup')?.value || null
      });
      showToast('Shipment created!', 'success');
      renderTab('shipments');
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.__updateShipmentStatus = async (id, status) => {
    let podNotes;
    if (status === 'DELIVERED' || status === 'FAILED') {
      podNotes = window.prompt(`Enter ${status === 'DELIVERED' ? 'Proof of Delivery (POD)' : 'failure'} notes:`) || '';
    }
    try {
      await api.updateShipment(id, { status, ...(podNotes !== undefined ? { podNotes } : {}) });
      showToast(`Shipment moved to ${status}`, 'success');
      renderTab('shipments');
    } catch (err) { showToast(err.message, 'error'); }
  };

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header"><h1>📦 Shipments & Lifecycle Tracking</h1><p>Structured status transitions from Created → Delivered with timestamped audit events and POD notes</p></div>

      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:14px;">+ Create Shipment</h3>
        <form onsubmit="window.__createShipment(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;">
          <div><label class="form-label">Client / Consignor *</label><input id="sh-client" class="input-field" placeholder="Sri Balaji Textiles" required /></div>
          <div><label class="form-label">Origin City *</label><input id="sh-origin" class="input-field" placeholder="Hyderabad" required /></div>
          <div><label class="form-label">Destination City *</label><input id="sh-dest" class="input-field" placeholder="Vijayawada" required /></div>
          <div><label class="form-label">Weight (kg) *</label><input id="sh-weight" type="number" min="1" step="0.5" class="input-field" placeholder="250" required /></div>
          <div><label class="form-label">Quote (₹)</label><input id="sh-quote" type="number" min="1" class="input-field" placeholder="3500" /></div>
          <div><label class="form-label">Assign Vehicle</label>
            <select id="sh-veh" class="input-field select-field">
              <option value="">Unassigned</option>
              ${vehicles.map((v) => `<option value="${esc(v.id)}">${esc(v.registrationNo)} (${esc(v.vehicleType)})</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Assign Driver</label>
            <select id="sh-drv" class="input-field select-field">
              <option value="">Unassigned</option>
              ${drivers.map((m) => `<option value="${esc(m.user.id)}">${esc(m.user.fullName)}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Pickup Date</label><input id="sh-pickup" type="date" class="input-field" /></div>
          <button type="submit" class="btn btn-primary">Create Shipment</button>
        </form>
      </div>

      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Tracking #</th><th>Client & Route</th><th>Load / Quote</th><th>Vehicle & Driver</th><th>Status</th><th>Update Status</th></tr></thead>
          <tbody>
            ${shipments.map((s) => `
              <tr>
                <td><code>${esc(s.trackingCode)}</code></td>
                <td><strong>${esc(s.clientName)}</strong><div style="font-size:11px;color:var(--color-text-muted);">${esc(s.originCity)} → ${esc(s.destinationCity)}</div>${s.podNotes ? `<div style="font-size:11px;color:var(--color-success);">POD: ${esc(s.podNotes)}</div>` : ''}</td>
                <td>${esc(s.weightKg)} kg${s.quotedAmount ? `<div style="font-size:11px;color:var(--color-text-muted);">₹${esc(s.quotedAmount)}</div>` : ''}</td>
                <td>${esc(s.vehicle?.registrationNo || 'No vehicle')}<div style="font-size:11px;color:var(--color-text-muted);">${esc(s.driver?.fullName || 'No driver')}</div></td>
                <td><span class="badge ${s.status === 'DELIVERED' ? 'badge-active' : s.status === 'FAILED' || s.status === 'CANCELLED' ? 'badge-rejected' : 'badge-brand'}">${esc(s.status)}</span></td>
                <td>
                  <select onchange="window.__updateShipmentStatus('${esc(s.id)}', this.value)" class="input-field select-field" style="width:165px;padding:4px 8px;font-size:12px;">
                    ${SHIPMENT_STATUSES.map((st) => `<option value="${st}" ${s.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                  </select>
                </td>
              </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);">No shipments recorded yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function fleetTab() {
  const [{ vehicles = [] }, { members = [] }] = await Promise.all([
    api.getVehicles(),
    api.getOrgMembers().catch(() => ({ members: [] }))
  ]);
  const drivers = members.filter((m) => m.workerRole === 'DRIVER' || m.isOwner);

  window.__addVehicle = async (e) => {
    e.preventDefault();
    try {
      await api.createVehicle({
        registrationNo: document.getElementById('fv-reg')?.value.trim(),
        vehicleType: document.getElementById('fv-type')?.value.trim(),
        capacityKg: Number(document.getElementById('fv-cap')?.value),
        insuranceExpiry: document.getElementById('fv-ins')?.value || null,
        permitExpiry: document.getElementById('fv-perm')?.value || null,
        assignedDriverId: document.getElementById('fv-drv')?.value || null
      });
      showToast('Vehicle added to fleet!', 'success');
      renderTab('fleet');
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.__setVehicleStatus = async (id, status) => {
    try { await api.updateVehicle(id, { status }); showToast(`Vehicle marked ${status}`, 'success'); renderTab('fleet'); }
    catch (err) { showToast(err.message, 'error'); }
  };

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header"><h1>🚛 Fleet & Vehicles</h1><p>Register transport vehicles, load capacities, insurance/permit expiry dates, and availability</p></div>

      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:14px;">+ Add Vehicle</h3>
        <form onsubmit="window.__addVehicle(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;">
          <div><label class="form-label">Registration No. *</label><input id="fv-reg" class="input-field" placeholder="TS09AB1234" required /></div>
          <div><label class="form-label">Vehicle Type *</label><input id="fv-type" class="input-field" placeholder="14ft Container / LCV" required /></div>
          <div><label class="form-label">Load Capacity (kg) *</label><input id="fv-cap" type="number" min="50" class="input-field" placeholder="3500" required /></div>
          <div><label class="form-label">Insurance Expiry</label><input id="fv-ins" type="date" class="input-field" /></div>
          <div><label class="form-label">Permit Expiry</label><input id="fv-perm" type="date" class="input-field" /></div>
          <div><label class="form-label">Assigned Driver</label>
            <select id="fv-drv" class="input-field select-field">
              <option value="">Unassigned</option>
              ${drivers.map((m) => `<option value="${esc(m.user.id)}">${esc(m.user.fullName)}</option>`).join('')}
            </select>
          </div>
          <button type="submit" class="btn btn-primary">Add Vehicle</button>
        </form>
      </div>

      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Registration</th><th>Type</th><th>Capacity</th><th>Driver</th><th>Insurance / Permit</th><th>Status</th></tr></thead>
          <tbody>
            ${vehicles.map((v) => `
              <tr>
                <td><strong>${esc(v.registrationNo)}</strong></td>
                <td>${esc(v.vehicleType)}</td>
                <td>${esc(v.capacityKg)} kg</td>
                <td>${esc(v.assignedDriver?.fullName || 'Unassigned')}</td>
                <td style="font-size:11px;color:var(--color-text-muted);">
                  Ins: ${v.insuranceExpiry ? esc(new Date(v.insuranceExpiry).toLocaleDateString('en-IN')) : '—'}<br/>
                  Permit: ${v.permitExpiry ? esc(new Date(v.permitExpiry).toLocaleDateString('en-IN')) : '—'}
                </td>
                <td>
                  <select onchange="window.__setVehicleStatus('${esc(v.id)}', this.value)" class="input-field select-field" style="width:140px;padding:4px 8px;font-size:12px;">
                    ${['AVAILABLE', 'ON_TRIP', 'MAINTENANCE'].map((st) => `<option value="${st}" ${v.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                  </select>
                </td>
              </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);">No vehicles registered yet.</td></tr>'}
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
