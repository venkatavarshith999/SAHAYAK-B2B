/**
 * SAHAYAK B2B — Complete Organization-Bound Workers Portal
 * Real DB-backed Tasks, Attendance (Check-In/Out & Working Hours), Leave Applications/Approvals,
 * Role-Specific Operational Workspaces, Organization Info, Login History & Sahayak AI.
 */

import { store, setState, persistUser } from '../../store.js';
import { api } from '../../api.js';
import { renderSidebar } from '../../components/sidebar.js';
import { AICopilot } from '../../components/ai-copilot.js';
import { renderPartnershipsPanel } from '../../components/partnerships-panel.js';
import { showToast } from '../../components/toast.js';
import { navigate } from '../../router.js';
import { esc, fmtDate } from '../../utils/sanitize.js';

let activeTab = 'overview';

const TITLES = {
  overview: 'Worker Dashboard',
  tasks: 'My Assigned Tasks',
  'role-workspace': 'Role Workspace',
  attendance: 'Attendance & Working Hours',
  leaves: 'Leave Applications',
  'org-info': 'My Organization',
  security: 'Login History'
};

export default function renderWorkerDashboard(container) {
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
      ${[['🏠', 'Home', 'overview'], ['✅', 'Tasks', 'tasks'], ['⏱️', 'Time', 'attendance'], ['🗓️', 'Leave', 'leaves']].map(([icon, label, tab]) => `
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
      <div class="topbar-title" id="topbar-title">Worker Dashboard</div>
    </div>
    <div class="topbar-actions">
      <span class="badge badge-brand">${esc((user?.membership?.workerRole || 'WORKER').replace(/_/g, ' '))}</span>
      <div class="avatar avatar-sm">${esc((user?.fullName || 'W')[0].toUpperCase())}</div>
    </div>
  `;
}

async function renderTab(tab) {
  const content = document.getElementById('main-content');
  if (!content) return;
  const t = document.getElementById('topbar-title');
  if (t) t.textContent = TITLES[tab] || 'Workers Portal';
  content.innerHTML = `<div class="page-enter"><p style="color:var(--color-text-muted);">Loading…</p></div>`;

  try {
    let html = '';
    if (tab === 'overview') html = await overviewTab();
    else if (tab === 'tasks') html = await tasksTab();
    else if (tab === 'role-workspace') html = await roleWorkspaceTab();
    else if (tab === 'attendance') html = await attendanceTab();
    else if (tab === 'leaves') html = await leavesTab();
    else if (tab === 'org-info') html = orgInfoTab();
    else if (tab === 'security') html = await securityTab();

    if (tab !== activeTab) return;
    content.innerHTML = `<div class="page-enter">${html}</div>`;
  } catch (err) {
    if (tab !== activeTab) return;
    content.innerHTML = `<div class="alert alert-danger"><span>❌</span><div>${esc(err.message || 'Failed to load workspace.')}</div></div>`;
  }
}

async function overviewTab() {
  const d = await api.getWorkerDashboard();
  const s = d.stats;
  const att = d.todayAttendance;
  const org = store.user?.organization;

  return `
    <div class="stagger-children" style="display:flex;flex-direction:column;gap:20px;">
      <div class="card-soft p-6" style="background:var(--grad-soft);border:1px solid var(--color-brand-200,#ddd6fe);">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
          <div>
            <h1 style="font-size:var(--text-2xl);font-weight:900;">Hello, ${esc(store.user?.fullName)}</h1>
            <p style="font-size:var(--text-sm);color:var(--color-text-secondary);margin-top:4px;">
              ${esc((store.user?.membership?.workerRole || 'STAFF').replace(/_/g, ' '))} at <strong>${esc(org?.name || 'Organization')}</strong>
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${!att ? `<button class="btn btn-primary btn-sm" onclick="window.__quickCheckIn()">⏱️ Check In Now</button>`
              : !att.checkOutAt ? `<button class="btn btn-danger btn-sm" onclick="window.__quickCheckOut()">🏁 Check Out (${esc(new Date(att.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))})</button>`
              : `<span class="badge badge-active">✓ Shift Complete (${esc((att.workMinutes / 60).toFixed(1))}h)</span>`}
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;">
        ${metric('Pending Tasks', s.pendingTasks, '📋', 'brand', `${s.overdueTasks} overdue`)}
        ${metric('Completed Tasks', s.completedTasks, '✅', 'success', `of ${s.totalTasks} assigned`)}
        ${metric('Hours This Month', s.hoursWorkedThisMonth + 'h', '⏱️', 'brand', `${s.daysPresentThisMonth} day(s) present`)}
        ${metric('Leave Balance', s.remainingLeaveDays + 'd', '🗓️', 'success', `${s.approvedLeaveDays} used · ${s.pendingLeaveRequests} pending`)}
      </div>

      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:12px;">🔔 Recent Notifications</h3>
        ${(d.notifications || []).length ? d.notifications.map((n) => `
          <div style="padding:10px 0;border-bottom:1px solid var(--color-border);display:flex;justify-content:space-between;gap:12px;">
            <div>
              <div style="font-weight:600;font-size:var(--text-sm);">${esc(n.title)}</div>
              <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${esc(n.body)}</div>
            </div>
            <span style="font-size:11px;color:var(--color-text-muted);white-space:nowrap;">${esc(fmtDate(n.createdAt))}</span>
          </div>`).join('') : '<p style="color:var(--color-text-muted);font-size:var(--text-sm);">No notifications yet.</p>'}
      </div>
    </div>`;
}

async function tasksTab() {
  const { tasks = [] } = await api.getWorkerTasks('mine');
  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:16px;">
      <div class="page-header"><h1>✅ My Assigned Tasks</h1><p>${tasks.length} task(s) assigned within ${esc(store.user?.organization?.name)}</p></div>
      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Task</th><th>Category</th><th>Priority</th><th>Due Date</th><th>Status</th><th>Update</th></tr></thead>
          <tbody>
            ${tasks.map((t) => `
              <tr>
                <td>
                  <strong>${esc(t.title)}</strong>
                  ${t.description ? `<div style="font-size:11px;color:var(--color-text-muted);">${esc(t.description)}</div>` : ''}
                  ${t.notes ? `<div style="font-size:11px;color:var(--color-primary);margin-top:2px;">Note: ${esc(t.notes)}</div>` : ''}
                </td>
                <td><span class="badge badge-muted">${esc(t.category)}</span></td>
                <td><span class="badge ${t.priority === 'URGENT' || t.priority === 'HIGH' ? 'badge-rejected' : 'badge-brand'}">${esc(t.priority)}</span></td>
                <td style="font-size:var(--text-xs);">${t.dueDate ? esc(new Date(t.dueDate).toLocaleDateString('en-IN')) : '—'}</td>
                <td><span class="badge ${t.status === 'COMPLETED' ? 'badge-active' : t.status === 'BLOCKED' ? 'badge-rejected' : 'badge-pending'}">${esc(t.status)}</span></td>
                <td>
                  <select onchange="window.__updateTaskStatus('${esc(t.id)}', this.value)" class="input-field select-field" style="width:140px;padding:4px 8px;font-size:12px;">
                    ${['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'].map((st) => `<option value="${st}" ${t.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                  </select>
                </td>
              </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);">No tasks assigned yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function roleWorkspaceTab() {
  const mem = store.user?.membership;
  const role = mem?.workerRole || 'STAFF';
  const perms = mem?.permissions || [];
  const blocks = [];

  // Manager / Verification Manager Partnership Review Workspace
  if (perms.includes('REVIEW_PARTNERSHIPS') || perms.includes('APPROVE_PARTNERSHIPS')) {
    const pHtml = await renderPartnershipsPanel(() => renderTab('role-workspace')).catch(() => '');
    if (pHtml) blocks.push(pHtml);
  }

  // Manager controls: assign tasks, review team leaves, view team attendance
  if (perms.includes('ASSIGN_TASKS') || perms.includes('MANAGE_WORKERS') || perms.includes('APPROVE_LEAVE')) {
    const [{ members = [] }, { tasks = [] }, { leaves = [] }] = await Promise.all([
      api.getOrgMembers().catch(() => ({ members: [] })),
      api.getWorkerTasks('org').catch(() => ({ tasks: [] })),
      api.getWorkerLeaves('org').catch(() => ({ leaves: [] }))
    ]);
    const pendingLeaves = leaves.filter((l) => l.status === 'PENDING');
    blocks.push(`
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:14px;">👔 Manager Workspace — Assign Task to Team</h3>
        <form onsubmit="window.__mgrCreateTask(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end;">
          <div><label class="form-label">Task Title *</label><input id="mt-title" class="input-field" required placeholder="Verify batch / Dispatch order" /></div>
          <div><label class="form-label">Assign To *</label>
            <select id="mt-assignee" class="input-field select-field" required>
              ${members.map((m) => `<option value="${esc(m.user.id)}">${esc(m.user.fullName)} (${esc(m.workerRole || 'Owner')})</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Category</label>
            <select id="mt-cat" class="input-field select-field">
              ${['GENERAL', 'PROCUREMENT', 'SALES', 'WAREHOUSE', 'MANUFACTURING', 'LOGISTICS', 'VERIFICATION'].map((c) => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Priority</label>
            <select id="mt-prio" class="input-field select-field">
              ${['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => `<option value="${p}" ${p === 'MEDIUM' ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Due Date</label><input id="mt-due" type="date" class="input-field" /></div>
          <button type="submit" class="btn btn-primary">Assign Task</button>
        </form>
        <div style="margin-top:16px;font-size:var(--text-xs);color:var(--color-text-muted);">
          Active org tasks: <strong>${tasks.length}</strong> · Pending team leave requests: <strong>${pendingLeaves.length}</strong>
        </div>
      </div>
    `);

    if (pendingLeaves.length) {
      blocks.push(`
        <div class="card-soft p-6">
          <h3 style="font-weight:700;margin-bottom:12px;">🗓️ Pending Leave Approvals</h3>
          <table class="data-table"><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Reason</th><th>Actions</th></tr></thead><tbody>
            ${pendingLeaves.map((l) => `
              <tr>
                <td><strong>${esc(l.user?.fullName)}</strong></td>
                <td><span class="badge badge-brand">${esc(l.leaveType)}</span></td>
                <td>${esc(l.startDate)} → ${esc(l.endDate)} (${esc(l.days)}d)</td>
                <td>${esc(l.reason)}</td>
                <td><div style="display:flex;gap:6px;">
                  <button class="btn btn-sm" style="background:var(--color-success-bg);color:var(--color-success);" onclick="window.__reviewLeave('${esc(l.id)}','APPROVED')">✓ Approve</button>
                  <button class="btn btn-danger btn-sm" onclick="window.__reviewLeave('${esc(l.id)}','REJECTED')">✗ Reject</button>
                </div></td>
              </tr>`).join('')}
          </tbody></table>
        </div>`);
    }
  }

  // Logistics Driver / Coordinator Workspace
  if (perms.includes('VIEW_ASSIGNED_SHIPMENTS') || perms.includes('MANAGE_SHIPMENTS')) {
    const { shipments = [] } = await api.getShipments().catch(() => ({ shipments: [] }));
    blocks.push(`
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:12px;">🚚 Assigned Shipments & Delivery Updates</h3>
        ${shipments.length ? `<table class="data-table"><thead><tr><th>Tracking</th><th>Route</th><th>Client</th><th>Status</th><th>Update</th></tr></thead><tbody>
          ${shipments.map((sh) => `
            <tr>
              <td><strong>${esc(sh.trackingCode)}</strong></td>
              <td>${esc(sh.originCity)} → ${esc(sh.destinationCity)}</td>
              <td>${esc(sh.clientName)}</td>
              <td><span class="badge badge-brand">${esc(sh.status)}</span></td>
              <td>
                <select onchange="window.__driverUpdateShipment('${esc(sh.id)}', this.value)" class="input-field select-field" style="width:160px;padding:4px 8px;font-size:12px;">
                  ${['ACCEPTED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'].map((st) => `<option value="${st}" ${sh.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                </select>
              </td>
            </tr>`).join('')}
        </tbody></table>` : '<p style="color:var(--color-text-muted);font-size:var(--text-sm);">No shipments assigned to you yet.</p>'}
      </div>`);
  }

  // Warehouse / Inventory Workspace
  if (perms.includes('VIEW_INVENTORY') && store.user?.organization?.portalType === 'SELLER') {
    const { products = [] } = await api.getSellerProducts().catch(() => ({ products: [] }));
    blocks.push(`
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:12px;">📦 Warehouse & Inventory Stock (${products.length} SKUs)</h3>
        ${products.length ? `<table class="data-table"><thead><tr><th>SKU</th><th>Product</th><th>Stock</th><th>Reserved</th><th>Status</th></tr></thead><tbody>
          ${products.map((p) => `
            <tr>
              <td><code>${esc(p.sku)}</code></td>
              <td><strong>${esc(p.name)}</strong></td>
              <td>${esc(p.stockQty)} ${esc(p.unit)}</td>
              <td>${esc(p.reservedQty)}</td>
              <td><span class="badge ${p.stockQty <= p.lowStockThreshold ? 'badge-warning' : 'badge-active'}">${p.stockQty <= p.lowStockThreshold ? 'Low Stock' : 'In Stock'}</span></td>
            </tr>`).join('')}
        </tbody></table>` : '<p style="color:var(--color-text-muted);font-size:var(--text-sm);">No catalogue products found in your organization yet.</p>'}
      </div>`);
  }

  // Manufacturing Workspace
  if (perms.includes('VIEW_PRODUCTION')) {
    const { orders = [] } = await api.getProductionOrders().catch(() => ({ orders: [] }));
    blocks.push(`
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:12px;">🏭 Manufacturing & QC Production Orders (${orders.length})</h3>
        ${orders.length ? `<table class="data-table"><thead><tr><th>Order #</th><th>Product</th><th>Progress</th><th>Stage</th><th>QC</th></tr></thead><tbody>
          ${orders.map((o) => `
            <tr>
              <td><code>${esc(o.orderNumber)}</code></td>
              <td><strong>${esc(o.productName)}</strong></td>
              <td>${esc(o.completedQty)} / ${esc(o.targetQty)}</td>
              <td><span class="badge badge-brand">${esc(o.stage)}</span></td>
              <td><span class="badge ${o.qcStatus === 'PASSED' ? 'badge-active' : 'badge-pending'}">${esc(o.qcStatus)}</span></td>
            </tr>`).join('')}
        </tbody></table>` : '<p style="color:var(--color-text-muted);font-size:var(--text-sm);">No production orders scheduled yet.</p>'}
      </div>`);
  }

  if (!blocks.length) {
    blocks.push(`
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:8px;">🧰 ${esc(role.replace(/_/g, ' '))} Workspace</h3>
        <p style="font-size:var(--text-sm);color:var(--color-text-muted);">
          Your workspace is scoped to your delegated permissions: <strong>${esc(perms.join(', ') || 'Standard Task Access')}</strong>.
          Use <strong>My Tasks</strong>, <strong>Attendance</strong>, and <strong>Leave Applications</strong> for daily operations.
        </p>
      </div>`);
  }

  return `<div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">${blocks.join('')}</div>`;
}

async function attendanceTab() {
  const { today, records = [] } = await api.getWorkerAttendance();
  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header"><h1>⏱️ Attendance & Working Hours</h1><p>Shift check-in/check-out with transparent, consent-based optional location logging</p></div>

      <div class="card-soft p-6">
        ${!today ? `
          <h3 style="font-weight:700;margin-bottom:12px;">Start Today's Shift</h3>
          <form onsubmit="window.__submitCheckIn(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end;">
            <div>
              <label class="form-label">Shift</label>
              <select id="att-shift" class="input-field select-field">
                <option value="GENERAL">General (9 AM – 6 PM)</option>
                <option value="MORNING">Morning Shift</option>
                <option value="EVENING">Evening Shift</option>
                <option value="NIGHT">Night Shift</option>
              </select>
            </div>
            <div>
              <label class="form-label">Location Note (Optional)</label>
              <input id="att-loc" class="input-field" placeholder="e.g. Warehouse Gate 2" />
            </div>
            <label style="display:flex;align-items:center;gap:8px;font-size:var(--text-xs);cursor:pointer;">
              <input id="att-consent" type="checkbox" /> I consent to log location note
            </label>
            <button type="submit" class="btn btn-primary">✓ Check In</button>
          </form>
        ` : !today.checkOutAt ? `
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
            <div>
              <span class="badge badge-active">Checked In</span>
              <div style="font-weight:700;margin-top:6px;">Shift: ${esc(today.shift)} · Started at ${esc(fmtDate(today.checkInAt))}</div>
            </div>
            <button class="btn btn-danger" onclick="window.__quickCheckOut()">🏁 Check Out & Calculate Hours</button>
          </div>
        ` : `
          <div class="alert alert-success"><span>✅</span><div>Today's shift completed: <strong>${esc((today.workMinutes / 60).toFixed(2))} hours</strong> (${esc(today.status)}).</div></div>
        `}
      </div>

      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Shift</th><th>Check In</th><th>Check Out</th><th>Hours</th><th>Status</th></tr></thead>
          <tbody>
            ${records.map((r) => `
              <tr>
                <td><strong>${esc(r.date)}</strong></td>
                <td>${esc(r.shift)}</td>
                <td>${esc(fmtDate(r.checkInAt))}</td>
                <td>${esc(fmtDate(r.checkOutAt))}</td>
                <td>${r.workMinutes ? esc((r.workMinutes / 60).toFixed(2)) + 'h' : '—'}</td>
                <td><span class="badge ${r.status === 'PRESENT' ? 'badge-active' : 'badge-pending'}">${esc(r.status)}</span></td>
              </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);">No attendance records yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function leavesTab() {
  const { leaves = [] } = await api.getWorkerLeaves('mine');
  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header"><h1>🗓️ Leave Applications</h1><p>Apply for leave and track manager approval status</p></div>

      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:12px;">Apply for Leave</h3>
        <form onsubmit="window.__submitLeave(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;align-items:end;">
          <div>
            <label class="form-label">Leave Type</label>
            <select id="lv-type" class="input-field select-field">
              <option value="CASUAL">Casual Leave</option>
              <option value="SICK">Sick Leave</option>
              <option value="EARNED">Earned Leave</option>
              <option value="UNPAID">Unpaid Leave</option>
            </select>
          </div>
          <div><label class="form-label">Start Date *</label><input id="lv-start" type="date" class="input-field" required /></div>
          <div><label class="form-label">End Date *</label><input id="lv-end" type="date" class="input-field" required /></div>
          <div style="grid-column:span 2;"><label class="form-label">Reason *</label><input id="lv-reason" class="input-field" placeholder="Brief reason for leave" required /></div>
          <button type="submit" class="btn btn-primary">Submit Leave Request</button>
        </form>
      </div>

      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Reviewer Notes</th></tr></thead>
          <tbody>
            ${leaves.map((l) => `
              <tr>
                <td><span class="badge badge-brand">${esc(l.leaveType)}</span></td>
                <td>${esc(l.startDate)} → ${esc(l.endDate)}</td>
                <td>${esc(l.days)}</td>
                <td>${esc(l.reason)}</td>
                <td><span class="badge ${l.status === 'APPROVED' ? 'badge-active' : l.status === 'REJECTED' ? 'badge-rejected' : 'badge-pending'}">${esc(l.status)}</span></td>
                <td style="font-size:var(--text-xs);color:var(--color-text-muted);">${esc(l.reviewerNotes || '—')}</td>
              </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);">No leave applications yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

function orgInfoTab() {
  const org = store.user?.organization;
  const mem = store.user?.membership;
  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:16px;">
      <div class="card-soft p-6">
        <h2 style="font-weight:800;margin-bottom:12px;">🏢 ${esc(org?.name || 'Organization')}</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;font-size:var(--text-sm);">
          <div><span style="color:var(--color-text-muted);">Business Type:</span> <strong>${esc(org?.businessType || '—')}</strong></div>
          <div><span style="color:var(--color-text-muted);">Location:</span> <strong>${esc(org?.city || '—')}, ${esc(org?.state || '—')}</strong></div>
          <div><span style="color:var(--color-text-muted);">Employee ID:</span> <strong>${esc(mem?.employeeId || '—')}</strong></div>
          <div><span style="color:var(--color-text-muted);">Department:</span> <strong>${esc(mem?.department || 'General')}</strong></div>
          <div><span style="color:var(--color-text-muted);">Designation:</span> <strong>${esc(mem?.designation || 'Team Member')}</strong></div>
          <div><span style="color:var(--color-text-muted);">Assigned Branch:</span> <strong>${esc(mem?.branchName || 'Primary HQ')}</strong></div>
        </div>
      </div>
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:10px;">Delegated Organization Permissions</h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${(mem?.permissions || []).map((p) => `<span class="badge badge-brand">${esc(p)}</span>`).join('') || '<span style="color:var(--color-text-muted);">Standard access</span>'}
        </div>
      </div>
    </div>`;
}

async function securityTab() {
  const { history = [] } = await api.getLoginHistory();
  return `
    <div class="animate-fadeInUp">
      <div class="page-header"><h1>🔐 Login & Security History</h1></div>
      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Time</th><th>Method</th><th>Result</th><th>IP</th></tr></thead>
          <tbody>
            ${history.map((h) => `
              <tr>
                <td>${esc(fmtDate(h.createdAt))}</td>
                <td>${esc(h.method)}</td>
                <td><span class="badge ${h.success ? 'badge-active' : 'badge-rejected'}">${h.success ? 'Success' : esc(h.failureReason || 'Failed')}</span></td>
                <td>${esc(h.ipAddress || '—')}</td>
              </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);">No events recorded.</td></tr>'}
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
  navigate('/worker-access');
}

// ── Global Action Handlers ────────────────────────────────────────────────────
window.__quickCheckIn = async () => {
  try { await api.checkInAttendance({ shift: 'GENERAL', locationConsent: false }); showToast('Checked in!', 'success'); renderTab(activeTab); }
  catch (e) { showToast(e.message, 'error'); }
};
window.__submitCheckIn = async (e) => {
  e.preventDefault();
  try {
    await api.checkInAttendance({
      shift: document.getElementById('att-shift')?.value || 'GENERAL',
      locationConsent: Boolean(document.getElementById('att-consent')?.checked),
      locationNote: document.getElementById('att-loc')?.value.trim() || null
    });
    showToast('Shift check-in recorded!', 'success');
    renderTab('attendance');
  } catch (err) { showToast(err.message, 'error'); }
};
window.__quickCheckOut = async () => {
  try { const r = await api.checkOutAttendance(); showToast(`Checked out (${(r.record.workMinutes / 60).toFixed(2)}h worked)`, 'success'); renderTab(activeTab); }
  catch (e) { showToast(e.message, 'error'); }
};
window.__updateTaskStatus = async (id, status) => {
  try { await api.updateWorkerTask(id, { status }); showToast(`Task marked ${status}`, 'success'); renderTab('tasks'); }
  catch (e) { showToast(e.message, 'error'); }
};
window.__submitLeave = async (e) => {
  e.preventDefault();
  try {
    await api.applyLeave({
      leaveType: document.getElementById('lv-type')?.value,
      startDate: document.getElementById('lv-start')?.value,
      endDate: document.getElementById('lv-end')?.value,
      reason: document.getElementById('lv-reason')?.value.trim()
    });
    showToast('Leave request submitted for manager review.', 'success');
    renderTab('leaves');
  } catch (err) { showToast(err.message, 'error'); }
};
window.__mgrCreateTask = async (e) => {
  e.preventDefault();
  try {
    await api.createWorkerTask({
      title: document.getElementById('mt-title')?.value.trim(),
      assignedToId: document.getElementById('mt-assignee')?.value,
      category: document.getElementById('mt-cat')?.value,
      priority: document.getElementById('mt-prio')?.value,
      dueDate: document.getElementById('mt-due')?.value || null
    });
    showToast('Task assigned!', 'success');
    renderTab('role-workspace');
  } catch (err) { showToast(err.message, 'error'); }
};
window.__reviewLeave = async (id, status) => {
  const notes = window.prompt(`${status === 'APPROVED' ? 'Approval' : 'Rejection'} notes (optional):`);
  if (notes === null) return;
  try { await api.reviewLeave(id, status, notes); showToast(`Leave ${status.toLowerCase()}`, 'success'); renderTab('role-workspace'); }
  catch (e) { showToast(e.message, 'error'); }
};
window.__driverUpdateShipment = async (id, status) => {
  const podNotes = status === 'DELIVERED' || status === 'FAILED' ? (window.prompt('Delivery / POD notes:') || '') : undefined;
  try { await api.updateShipment(id, { status, ...(podNotes !== undefined ? { podNotes } : {}) }); showToast(`Shipment updated to ${status}`, 'success'); renderTab('role-workspace'); }
  catch (e) { showToast(e.message, 'error'); }
};
