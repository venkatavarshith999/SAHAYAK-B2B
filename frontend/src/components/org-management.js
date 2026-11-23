/**
 * SAHAYAK B2B — Shared Organization Management UI Component
 * Reusable across Seller, Buyer, and Logistics Portals:
 *  - Organization Profile & Branches
 *  - Team, Worker Invitations, Task Assignment & Leave Approvals
 *  - Verification Documents Upload & Download
 */

import { api } from '../api.js';
import { store, persistUser, setState } from '../store.js';
import { showToast } from './toast.js';
import { esc, fmtDate } from '../utils/sanitize.js';

const WORKER_ROLES = [
  'BUSINESS_MANAGER', 'VERIFICATION_MANAGER', 'PROCUREMENT_MANAGER', 'SALES_EXECUTIVE',
  'CUSTOMER_SUPPORT', 'INVENTORY_MANAGER', 'WAREHOUSE_STAFF', 'PACKAGING_STAFF',
  'DISPATCH_STAFF', 'MANUFACTURING_SUPERVISOR', 'PRODUCTION_WORKER', 'QUALITY_CONTROL',
  'ACCOUNTANT', 'LOGISTICS_COORDINATOR', 'DRIVER'
];

let lastInviteInfo = null;

export async function renderOrgProfileAndBranches(onRefresh) {
  const { organization: org } = await api.getOrgProfile();
  const branches = org?.branches || [];
  const isOwner = Boolean(store.user?.membership?.isOwner);

  window.__saveOrgProfile = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: document.getElementById('op-name')?.value.trim(),
        category: document.getElementById('op-cat')?.value.trim(),
        description: document.getElementById('op-desc')?.value.trim(),
        address: document.getElementById('op-addr')?.value.trim(),
        city: document.getElementById('op-city')?.value.trim(),
        district: document.getElementById('op-dist')?.value.trim(),
        state: document.getElementById('op-state')?.value.trim(),
        pinCode: document.getElementById('op-pin')?.value.trim(),
        operatingRegions: document.getElementById('op-regions')?.value.trim()
      };
      if (org.businessType === 'MANUFACTURER') {
        payload.productionCapacity = document.getElementById('op-cap')?.value.trim();
      }
      if (org.portalType === 'LOGISTICS') {
        payload.vehicleTypes = document.getElementById('op-veh')?.value.trim();
      }
      await api.updateOrgProfile(payload);
      const freshMe = await api.me();
      persistUser(freshMe);
      setState({ user: freshMe });
      showToast('Organization profile updated!', 'success');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to update profile.', 'error');
    }
  };

  window.__createOrgBranch = async (e) => {
    e.preventDefault();
    try {
      await api.createBranch({
        name: document.getElementById('br-name')?.value.trim(),
        type: document.getElementById('br-type')?.value || 'BRANCH',
        address: document.getElementById('br-addr')?.value.trim(),
        city: document.getElementById('br-city')?.value.trim(),
        state: document.getElementById('br-state')?.value.trim(),
        pinCode: document.getElementById('br-pin')?.value.trim()
      });
      showToast('Branch / location added!', 'success');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to create branch.', 'error');
    }
  };

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header">
        <h1>🏢 Organization Profile & Branches</h1>
        <p>${esc(org.name)} · <span class="badge badge-brand">${esc(org.businessType)}</span> <span class="badge ${org.verificationStatus === 'ACTIVE' ? 'badge-active' : 'badge-pending'}">${esc(org.verificationStatus)}</span></p>
      </div>

      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:14px;">Organization Details</h3>
        <form onsubmit="window.__saveOrgProfile(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
          <div><label class="form-label">Business Name</label><input id="op-name" class="input-field" value="${esc(org.name)}" ${isOwner ? '' : 'disabled'} required /></div>
          <div><label class="form-label">Category</label><input id="op-cat" class="input-field" value="${esc(org.category)}" ${isOwner ? '' : 'disabled'} required /></div>
          <div><label class="form-label">GSTIN (Verified by Admin)</label><input class="input-field" value="${esc(org.gstin || 'Not provided')}" disabled /></div>
          <div><label class="form-label">Address</label><input id="op-addr" class="input-field" value="${esc(org.address)}" ${isOwner ? '' : 'disabled'} required /></div>
          <div><label class="form-label">City</label><input id="op-city" class="input-field" value="${esc(org.city)}" ${isOwner ? '' : 'disabled'} required /></div>
          <div><label class="form-label">District</label><input id="op-dist" class="input-field" value="${esc(org.district || '')}" ${isOwner ? '' : 'disabled'} /></div>
          <div><label class="form-label">State</label><input id="op-state" class="input-field" value="${esc(org.state)}" ${isOwner ? '' : 'disabled'} required /></div>
          <div><label class="form-label">PIN Code</label><input id="op-pin" class="input-field" value="${esc(org.pinCode)}" ${isOwner ? '' : 'disabled'} required /></div>
          <div><label class="form-label">Operating Regions</label><input id="op-regions" class="input-field" value="${esc(org.operatingRegions || '')}" ${isOwner ? '' : 'disabled'} placeholder="e.g. Telangana, AP, Pan-India" /></div>
          ${org.businessType === 'MANUFACTURER' ? `<div><label class="form-label">Production Capacity</label><input id="op-cap" class="input-field" value="${esc(org.productionCapacity || '')}" ${isOwner ? '' : 'disabled'} /></div>` : ''}
          ${org.portalType === 'LOGISTICS' ? `<div><label class="form-label">Fleet / Vehicle Types</label><input id="op-veh" class="input-field" value="${esc(org.vehicleTypes || '')}" ${isOwner ? '' : 'disabled'} /></div>` : ''}
          <div style="grid-column:1 / -1;"><label class="form-label">Business Description</label><textarea id="op-desc" class="input-field" rows="2" ${isOwner ? '' : 'disabled'}>${esc(org.description || '')}</textarea></div>
          ${isOwner ? `<div style="grid-column:1 / -1;"><button type="submit" class="btn btn-primary btn-sm">Save Profile Changes</button></div>` : ''}
        </form>
      </div>

      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:14px;">📍 Branches, Stores, Warehouses & Factories (${branches.length})</h3>
        <div style="overflow-x:auto;margin-bottom:16px;">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Type</th><th>Address</th><th>City / State</th><th>PIN</th></tr></thead>
            <tbody>
              ${branches.map((b) => `
                <tr>
                  <td><strong>${esc(b.name)}</strong> ${b.isPrimary ? '<span class="badge badge-brand">Primary</span>' : ''}</td>
                  <td><span class="badge badge-muted">${esc(b.type)}</span></td>
                  <td>${esc(b.address)}</td>
                  <td>${esc(b.city)}, ${esc(b.state)}</td>
                  <td>${esc(b.pinCode)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <form onsubmit="window.__createOrgBranch(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;padding-top:12px;border-top:1px solid var(--color-border);">
          <div><label class="form-label">Branch Name *</label><input id="br-name" class="input-field" placeholder="e.g. East Warehouse" required /></div>
          <div><label class="form-label">Type</label>
            <select id="br-type" class="input-field select-field">
              ${['BRANCH', 'WAREHOUSE', 'STORE', 'FACTORY', 'REGIONAL_OFFICE'].map((t) => `<option value="${t}">${t.replace('_', ' ')}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Address *</label><input id="br-addr" class="input-field" placeholder="Plot / Street" required /></div>
          <div><label class="form-label">City *</label><input id="br-city" class="input-field" placeholder="City" required /></div>
          <div><label class="form-label">State *</label><input id="br-state" class="input-field" placeholder="State" required /></div>
          <div><label class="form-label">PIN *</label><input id="br-pin" class="input-field" placeholder="500001" required /></div>
          <button type="submit" class="btn btn-primary btn-sm">+ Add Location</button>
        </form>
      </div>
    </div>`;
}

export async function renderTeamManagement(onRefresh) {
  const [{ members = [] }, { invitations = [] }, { branches = [] }, { leaves = [] }, { tasks = [] }] = await Promise.all([
    api.getOrgMembers(),
    api.getInvitations().catch(() => ({ invitations: [] })),
    api.getBranches().catch(() => ({ branches: [] })),
    api.getWorkerLeaves('org').catch(() => ({ leaves: [] })),
    api.getWorkerTasks('org').catch(() => ({ tasks: [] }))
  ]);

  const pendingLeaves = leaves.filter((l) => l.status === 'PENDING');

  window.__inviteOrgWorker = async (e) => {
    e.preventDefault();
    try {
      const res = await api.inviteWorker({
        fullName: document.getElementById('iw-name')?.value.trim(),
        email: document.getElementById('iw-email')?.value.trim(),
        workerRole: document.getElementById('iw-role')?.value,
        employeeId: document.getElementById('iw-empid')?.value.trim() || '',
        department: document.getElementById('iw-dept')?.value.trim() || '',
        designation: document.getElementById('iw-desig')?.value.trim() || '',
        branchId: document.getElementById('iw-branch')?.value || null
      });
      lastInviteInfo = res;
      showToast(`Worker invitation created! Code: ${res.inviteCode}`, 'success', 6000);
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to invite worker.', 'error');
    }
  };

  window.__revokeOrgInvite = async (id) => {
    try { await api.revokeInvitation(id); showToast('Invitation revoked.', 'info'); onRefresh(); }
    catch (err) { showToast(err.message, 'error'); }
  };

  window.__assignOrgTask = async (e) => {
    e.preventDefault();
    try {
      await api.createWorkerTask({
        title: document.getElementById('ot-title')?.value.trim(),
        assignedToId: document.getElementById('ot-assignee')?.value,
        category: document.getElementById('ot-cat')?.value,
        priority: document.getElementById('ot-prio')?.value,
        dueDate: document.getElementById('ot-due')?.value || null
      });
      showToast('Task assigned to worker!', 'success');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to assign task.', 'error');
    }
  };

  window.__orgReviewLeave = async (id, status) => {
    const notes = window.prompt(`${status === 'APPROVED' ? 'Approval' : 'Rejection'} notes (optional):`);
    if (notes === null) return;
    try { await api.reviewLeave(id, status, notes); showToast(`Leave ${status.toLowerCase()}`, 'success'); onRefresh(); }
    catch (err) { showToast(err.message, 'error'); }
  };

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header">
        <h1>👷 Team, Worker Invitations & Workforce Operations</h1>
        <p>Invite employees into your organization, assign operational tasks, and review leave requests.</p>
      </div>

      ${lastInviteInfo ? `
        <div class="alert alert-success">
          <span>🎟️</span>
          <div>
            <strong>Invitation Ready for ${esc(lastInviteInfo.invitation?.email)}:</strong>
            Code: <code style="font-weight:800;font-size:14px;">${esc(lastInviteInfo.inviteCode)}</code> ·
            <a href="${esc(lastInviteInfo.inviteUrl)}" target="_blank" style="color:var(--color-primary);font-weight:700;">Open Join Link →</a>
          </div>
        </div>
      ` : ''}

      <!-- Invite Worker Form -->
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:14px;">+ Invite Employee / Worker</h3>
        <form onsubmit="window.__inviteOrgWorker(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end;">
          <div><label class="form-label">Employee Name *</label><input id="iw-name" class="input-field" placeholder="Full name" required /></div>
          <div><label class="form-label">Employee Email *</label><input id="iw-email" type="email" class="input-field" placeholder="worker@company.in" required /></div>
          <div><label class="form-label">Worker Role *</label>
            <select id="iw-role" class="input-field select-field" required>
              ${WORKER_ROLES.map((r) => `<option value="${r}">${r.replace(/_/g, ' ')}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Employee ID</label><input id="iw-empid" class="input-field" placeholder="EMP-001" /></div>
          <div><label class="form-label">Department</label><input id="iw-dept" class="input-field" placeholder="Warehouse / Sales" /></div>
          <div><label class="form-label">Designation</label><input id="iw-desig" class="input-field" placeholder="Supervisor / Driver" /></div>
          <div><label class="form-label">Branch</label>
            <select id="iw-branch" class="input-field select-field">
              <option value="">Primary HQ</option>
              ${branches.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}
            </select>
          </div>
          <button type="submit" class="btn btn-primary">Generate Invite Code</button>
        </form>
      </div>

      <!-- Active Members -->
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:12px;">Organization Members (${members.length})</h3>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role / Designation</th><th>Branch</th><th>Status</th></tr></thead>
            <tbody>
              ${members.map((m) => `
                <tr>
                  <td><strong>${esc(m.user?.fullName)}</strong> ${m.isOwner ? '<span class="badge badge-brand">Owner</span>' : ''}</td>
                  <td style="color:var(--color-text-muted);">${esc(m.user?.email)}</td>
                  <td>${esc(m.workerRole ? m.workerRole.replace(/_/g, ' ') : (m.designation || 'Owner'))} ${m.department ? '· ' + esc(m.department) : ''}</td>
                  <td>${esc(m.branch?.name || 'Primary HQ')}</td>
                  <td><span class="badge ${m.employmentStatus === 'ACTIVE' ? 'badge-active' : 'badge-muted'}">${esc(m.employmentStatus)}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pending Invitations -->
      ${invitations.length ? `
        <div class="card-soft p-6">
          <h3 style="font-weight:700;margin-bottom:12px;">Worker Invitations (${invitations.length})</h3>
          <table class="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th>Action</th></tr></thead>
            <tbody>
              ${invitations.map((inv) => `
                <tr>
                  <td><strong>${esc(inv.fullName)}</strong></td>
                  <td>${esc(inv.email)}</td>
                  <td><span class="badge badge-brand">${esc(inv.workerRole.replace(/_/g, ' '))}</span></td>
                  <td><span class="badge ${inv.status === 'ACCEPTED' ? 'badge-active' : inv.status === 'PENDING' ? 'badge-pending' : 'badge-muted'}">${esc(inv.status)}</span></td>
                  <td style="font-size:var(--text-xs);">${esc(fmtDate(inv.expiresAt))}</td>
                  <td>${inv.status === 'PENDING' ? `<button class="btn btn-danger btn-sm" onclick="window.__revokeOrgInvite('${esc(inv.id)}')">Revoke</button>` : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}

      <!-- Assign Task + Team Leave Approvals -->
      <div class="card-soft p-6">
        <h3 style="font-weight:700;margin-bottom:12px;">✅ Assign Task to Team Member (${tasks.length} org tasks)</h3>
        <form onsubmit="window.__assignOrgTask(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;">
          <div><label class="form-label">Task Title *</label><input id="ot-title" class="input-field" placeholder="e.g. Inspect stock lot #12" required /></div>
          <div><label class="form-label">Assignee *</label>
            <select id="ot-assignee" class="input-field select-field" required>
              ${members.map((m) => `<option value="${esc(m.user.id)}">${esc(m.user.fullName)} (${esc(m.workerRole || 'Owner')})</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Category</label>
            <select id="ot-cat" class="input-field select-field">
              ${['GENERAL', 'PROCUREMENT', 'SALES', 'WAREHOUSE', 'MANUFACTURING', 'LOGISTICS'].map((c) => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Priority</label>
            <select id="ot-prio" class="input-field select-field">
              ${['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => `<option value="${p}" ${p === 'MEDIUM' ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Due Date</label><input id="ot-due" type="date" class="input-field" /></div>
          <button type="submit" class="btn btn-primary btn-sm">Assign Task</button>
        </form>
      </div>

      ${pendingLeaves.length ? `
        <div class="card-soft p-6">
          <h3 style="font-weight:700;margin-bottom:12px;">🗓️ Pending Team Leave Approvals (${pendingLeaves.length})</h3>
          <table class="data-table">
            <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Reason</th><th>Decision</th></tr></thead>
            <tbody>
              ${pendingLeaves.map((l) => `
                <tr>
                  <td><strong>${esc(l.user?.fullName)}</strong></td>
                  <td><span class="badge badge-brand">${esc(l.leaveType)}</span></td>
                  <td>${esc(l.startDate)} → ${esc(l.endDate)} (${esc(l.days)}d)</td>
                  <td>${esc(l.reason)}</td>
                  <td><div style="display:flex;gap:6px;">
                    <button class="btn btn-sm" style="background:var(--color-success-bg);color:var(--color-success);" onclick="window.__orgReviewLeave('${esc(l.id)}','APPROVED')">✓ Approve</button>
                    <button class="btn btn-danger btn-sm" onclick="window.__orgReviewLeave('${esc(l.id)}','REJECTED')">✗ Reject</button>
                  </div></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
    </div>`;
}

export async function renderVerificationDocuments(onRefresh) {
  const { documents = [] } = await api.getOrgDocuments();

  window.__uploadOrgDoc = async (e) => {
    e.preventDefault();
    const file = document.getElementById('od-file')?.files?.[0];
    if (!file) return;
    try {
      await api.uploadOrgDocument(
        file,
        document.getElementById('od-type')?.value || 'BUSINESS_LICENSE',
        document.getElementById('od-exp')?.value || ''
      );
      showToast('Document uploaded!', 'success');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Upload failed.', 'error');
    }
  };

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:20px;">
      <div class="page-header"><h1>📎 Organization Verification Documents</h1><p>Upload GST certificates, trade licenses, factory permits, or transport documents (PDF/JPG/PNG up to 5MB)</p></div>

      <div class="card-soft p-6">
        <form onsubmit="window.__uploadOrgDoc(event)" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:end;">
          <div>
            <label class="form-label">Document Type</label>
            <select id="od-type" class="input-field select-field">
              <option value="GST_CERTIFICATE">GST Certificate</option>
              <option value="TRADE_LICENSE">Shop / Trade License</option>
              <option value="PAN_CARD">Business PAN</option>
              <option value="FACTORY_LICENSE">Factory / MSME License</option>
              <option value="TRANSPORT_PERMIT">Transport / Fleet Permit</option>
            </select>
          </div>
          <div><label class="form-label">Expiry Date (optional)</label><input id="od-exp" type="date" class="input-field" /></div>
          <div><label class="form-label">File *</label><input id="od-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="input-field" style="padding:7px;" required /></div>
          <button type="submit" class="btn btn-primary btn-sm">Upload Document</button>
        </form>
      </div>

      <div class="card-soft p-0" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Document Type</th><th>File Name</th><th>Size</th><th>Expiry</th><th>Uploaded</th><th>Download</th></tr></thead>
          <tbody>
            ${documents.map((d) => `
              <tr>
                <td><span class="badge badge-brand">${esc(d.docType)}</span></td>
                <td><strong>${esc(d.fileName)}</strong></td>
                <td>${esc((d.sizeBytes / 1024).toFixed(1))} KB</td>
                <td>${d.expiryDate ? esc(new Date(d.expiryDate).toLocaleDateString('en-IN')) : '—'}</td>
                <td style="font-size:var(--text-xs);">${esc(fmtDate(d.uploadedAt))}</td>
                <td><a href="/api/org/documents/${esc(d.id)}/download" target="_blank" class="btn btn-ghost btn-sm">View</a></td>
              </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);">No documents uploaded yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}
