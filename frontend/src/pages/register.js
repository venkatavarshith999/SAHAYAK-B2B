/**
 * SAHAYAK B2B — Business Registration Forms (Buyer, Seller [Wholesaler/Manufacturer/Distributor/Supplier], Logistics)
 * Conditional compliance fields + optional immediate verification document upload.
 */

import { navigate } from '../router.js';
import { api } from '../api.js';
import { showToast } from '../components/toast.js';
import { setState, persistUser } from '../store.js';

const CATEGORIES = [
  'Textiles & Garments', 'FMCG & Consumer Goods', 'Electronics & Electricals',
  'Stationery & Education', 'Kitchenware & Home', 'Hardware & Construction',
  'Pharmaceuticals & Healthcare', 'Agriculture & Food', 'Industrial Machinery', 'Logistics & Freight', 'Other'
];

function commonFields({ nameLabel = 'Full Name', bizLabel = 'Business Name', gstRequired = false, extra = [] }) {
  return [
    { id: 'fullName', label: nameLabel, placeholder: 'Full name', type: 'text', required: true, col: 1 },
    { id: 'businessName', label: bizLabel, placeholder: 'Legal business name', type: 'text', required: true, col: 1 },
    { id: 'email', label: 'Business Email', placeholder: 'you@business.in', type: 'email', required: true, col: 1 },
    { id: 'phone', label: 'Phone Number (+91)', placeholder: '9876543210', type: 'tel', required: true, col: 1 },
    { id: 'password', label: 'Password (min 8 chars)', placeholder: '••••••••', type: 'password', required: true, col: 1 },
    { id: 'confirmPassword', label: 'Confirm Password', placeholder: '••••••••', type: 'password', required: true, col: 1 },
    { id: 'address', label: 'Business Address', placeholder: 'Street, Building, Area', type: 'text', required: true, col: 2 },
    { id: 'city', label: 'City', placeholder: 'e.g. Hyderabad', type: 'text', required: true, col: 1 },
    { id: 'district', label: 'District', placeholder: 'e.g. Rangareddy', type: 'text', required: false, col: 1 },
    { id: 'state', label: 'State', placeholder: 'e.g. Telangana', type: 'text', required: true, col: 1 },
    { id: 'pinCode', label: 'PIN Code', placeholder: '500001', type: 'text', required: true, col: 1 },
    { id: 'category', label: 'Business Category', type: 'select', options: CATEGORIES, required: true, col: 1 },
    { id: 'gstin', label: gstRequired ? 'GSTIN' : 'GSTIN (optional if exempt)', placeholder: '29ABCDE1234F1Z5', type: 'text', required: gstRequired, col: 1 },
    { id: 'pan', label: 'Business PAN (optional)', placeholder: 'ABCDE1234F', type: 'text', required: false, col: 1 },
    { id: 'operatingRegions', label: 'Operating Regions', placeholder: 'e.g. Telangana, Andhra Pradesh, Pan-India', type: 'text', required: false, col: 1 },
    ...extra,
    { id: 'description', label: 'Business Description', placeholder: 'Products dealt in, service capabilities, or store profile', type: 'textarea', required: false, col: 2 }
  ];
}

const ROLE_CONFIGS = {
  retailer: {
    title: 'Buyer / Retailer',
    portalBadge: 'Buyer Portal',
    icon: '🛒',
    desc: 'Discover verified suppliers, submit RFQs, compare quotes, and negotiate bulk purchases',
    roleId: 'RETAILER',
    fields: commonFields({ bizLabel: 'Store / Organization Name', gstRequired: false })
  },
  wholesaler: {
    title: 'Wholesaler',
    portalBadge: 'Seller Portal · Wholesaler',
    icon: '📦',
    desc: 'Manage bulk catalogues, receive buyer RFQs, and connect with manufacturers',
    roleId: 'WHOLESALER',
    fields: commonFields({ nameLabel: 'Owner Name', gstRequired: true })
  },
  manufacturer: {
    title: 'Manufacturer / Company',
    portalBadge: 'Seller Portal · Manufacturer',
    icon: '🏭',
    desc: 'Publish factory capabilities, manage production orders, and approve distributor partnerships',
    roleId: 'MANUFACTURER',
    fields: commonFields({
      nameLabel: 'Authorized Representative',
      bizLabel: 'Company / Factory Name',
      gstRequired: true,
      extra: [
        { id: 'productionCapacity', label: 'Monthly Production Capacity', placeholder: 'e.g. 50,000 units / month', type: 'text', required: false, col: 2 }
      ]
    })
  },
  distributor: {
    title: 'Distributor',
    portalBadge: 'Seller Portal · Distributor',
    icon: '🏬',
    desc: 'Distribute across regional territories with multi-warehouse stock and manufacturer supply ties',
    roleId: 'DISTRIBUTOR',
    fields: commonFields({ nameLabel: 'Owner / Director Name', gstRequired: true })
  },
  supplier: {
    title: 'Supplier / Trader',
    portalBadge: 'Seller Portal · Supplier',
    icon: '🤝',
    desc: 'List B2B catalogues, respond to buyer RFQs, and negotiate via KAEN',
    roleId: 'SUPPLIER',
    fields: commonFields({ gstRequired: false })
  },
  logistics: {
    title: 'Transport & Logistics Partner',
    portalBadge: 'Transport & Logistics Portal',
    icon: '🚚',
    desc: 'Quote on B2B shipments, manage fleet & drivers, and submit digital proof of delivery',
    roleId: 'LOGISTICS',
    fields: commonFields({
      nameLabel: 'Operations Owner / Manager',
      bizLabel: 'Logistics Company Name',
      gstRequired: false,
      extra: [
        { id: 'vehicleTypes', label: 'Fleet / Vehicle Types', placeholder: 'e.g. LCV, 14ft Container, 32ft Trailer', type: 'text', required: false, col: 2 }
      ]
    })
  }
};

export default function renderRegister(container, params) {
  const roleKey = (params?.role || 'retailer').toLowerCase();
  const config = ROLE_CONFIGS[roleKey] || ROLE_CONFIGS.retailer;

  container.innerHTML = `
    <div class="auth-layout">
      <div class="auth-panel-left" style="padding:36px 24px;overflow-y:auto;">
        <div style="max-width:560px;width:100%;margin:0 auto;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
            <button onclick="navigate('/role-select')" class="btn btn-ghost btn-sm" style="padding:0;gap:6px;">
              ← Back
            </button>
            <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="navigate('/')">
              <img src="/logo.jpg" alt="Sahayak Logo" style="width:40px;height:40px;object-fit:contain;" />
              <span style="font-size:18px;font-weight:900;letter-spacing:-0.03em;">SAHAYAK <span style="color:var(--color-primary);">B2B</span></span>
            </div>
          </div>

          <div style="margin-bottom:28px;">
            <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:var(--color-brand-100);border-radius:var(--radius-full);margin-bottom:14px;">
              <span style="font-size:18px;">${config.icon}</span>
              <span style="font-size:var(--text-xs);font-weight:800;color:var(--color-primary);text-transform:uppercase;letter-spacing:0.06em;">${config.portalBadge}</span>
            </div>
            <h1 style="font-size:var(--text-3xl);font-weight:900;letter-spacing:-0.03em;margin-bottom:8px;">Register as <span style="color:var(--color-primary);">${config.title}</span></h1>
            <p style="color:var(--color-text-muted);font-size:var(--text-sm);">${config.desc}</p>
          </div>

          <form id="reg-form" onsubmit="window.__regSubmit(event)" novalidate>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;" id="form-fields">
              ${config.fields.map((field) => renderField(field)).join('')}
            </div>

            <!-- Optional Verification Document Upload -->
            <div style="margin-top:18px;padding:16px;border-radius:var(--radius-md);border:1px dashed var(--color-brand-200,#ddd6fe);background:var(--color-brand-50,#f5f3ff);">
              <label class="form-label" for="f-doc-file" style="margin-bottom:6px;display:block;">
                📎 Supporting Business Document (Optional now · PDF, JPG, PNG up to 5MB)
              </label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <select id="f-doc-type" class="input-field select-field">
                  <option value="GST_CERTIFICATE">GST Registration Certificate</option>
                  <option value="TRADE_LICENSE">Shop / Trade License</option>
                  <option value="PAN_CARD">Business PAN</option>
                  <option value="FACTORY_LICENSE">Factory / MSME Udyam License</option>
                  <option value="TRANSPORT_PERMIT">Transport / Fleet Permit</option>
                </select>
                <input id="f-doc-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="input-field" style="padding:8px;" />
              </div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:6px;">
                Verification badges are awarded only after authorized admin review of your details and documents.
              </div>
            </div>

            <div id="reg-error" class="alert alert-danger" style="margin-top:16px;display:none;"></div>

            <button type="submit" class="btn btn-primary btn-full btn-lg" style="margin-top:20px;" id="reg-submit">
              Submit for Business Verification →
            </button>
          </form>

          <p style="font-size:var(--text-xs);color:var(--color-text-muted);text-align:center;margin-top:16px;">
            Already registered? <a href="#/login" style="color:var(--color-primary);font-weight:700;">Sign In</a>
          </p>
        </div>
      </div>

      <div class="auth-panel-right gradient-animate">
        <div style="text-align:center;color:white;padding:40px;max-width:400px;">
          <div style="font-size:68px;margin-bottom:20px;animation:float 3s ease-in-out infinite;">${config.icon}</div>
          <h2 style="font-size:var(--text-3xl);font-weight:900;margin-bottom:14px;">Join as a<br/>${config.title}</h2>
          <p style="color:rgba(255,255,255,0.85);line-height:1.7;">${config.desc}</p>
          <div style="margin-top:32px;display:flex;flex-direction:column;gap:10px;text-align:left;">
            ${[
              'Dedicated organization workspace with branch & team support',
              'Independent admin document & GST verification',
              'KAEN multi-round negotiation & RFQ workflows',
              'Role-aware Sahayak AI business co-pilot'
            ].map((f) => `
              <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.12);padding:10px 14px;border-radius:var(--radius-md);font-size:var(--text-sm);">
                <span>✓</span><span>${f}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  const formFields = document.getElementById('form-fields');
  if (formFields && window.innerWidth < 640) {
    formFields.style.gridTemplateColumns = '1fr';
    formFields.querySelectorAll('[style*="grid-column"]').forEach((el) => { el.style.gridColumn = '1'; });
  }

  window.__regSubmit = (e) => handleRegister(e, config);
  window.navigate = navigate;
}

function renderField(field) {
  const colSpan = field.col === 2 ? 'style="grid-column:span 2;"' : '';
  if (field.type === 'select') {
    return `
      <div class="form-group" ${colSpan}>
        <label class="form-label" for="f-${field.id}">${field.label}${field.required ? ' *' : ''}</label>
        <select id="f-${field.id}" class="input-field select-field" ${field.required ? 'required' : ''}>
          <option value="">Select ${field.label}</option>
          ${field.options.map((o) => `<option value="${o}">${o}</option>`).join('')}
        </select>
      </div>`;
  }
  if (field.type === 'textarea') {
    return `
      <div class="form-group" ${colSpan}>
        <label class="form-label" for="f-${field.id}">${field.label}${field.required ? ' *' : ''}</label>
        <textarea id="f-${field.id}" class="input-field" rows="2" placeholder="${field.placeholder || ''}"></textarea>
      </div>`;
  }
  return `
    <div class="form-group" ${colSpan}>
      <label class="form-label" for="f-${field.id}">${field.label}${field.required ? ' *' : ''}</label>
      <input
        id="f-${field.id}"
        type="${field.type}"
        class="input-field"
        placeholder="${field.placeholder || ''}"
        ${field.required ? 'required' : ''}
        autocomplete="${field.type === 'email' ? 'email' : field.type === 'password' ? 'new-password' : 'off'}"
      />
    </div>`;
}

async function handleRegister(e, config) {
  e.preventDefault();
  const btn = document.getElementById('reg-submit');
  const errorEl = document.getElementById('reg-error');

  const formData = {};
  for (const field of config.fields) {
    const el = document.getElementById(`f-${field.id}`);
    const val = el ? el.value.trim() : '';
    if (field.required && !val) {
      errorEl.style.display = 'flex';
      errorEl.textContent = `❌ ${field.label} is required.`;
      el?.focus();
      return;
    }
    if (el) formData[field.map || field.id] = val;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email || '')) {
    errorEl.style.display = 'flex';
    errorEl.textContent = '❌ Please enter a valid business email address.';
    return;
  }

  if (formData.confirmPassword && formData.password !== formData.confirmPassword) {
    errorEl.style.display = 'flex';
    errorEl.innerHTML = '<span>❌</span> Passwords do not match.';
    return;
  }
  if (!formData.password || formData.password.length < 8) {
    errorEl.style.display = 'flex';
    errorEl.innerHTML = '<span>❌</span> Password must be at least 8 characters.';
    return;
  }

  delete formData.confirmPassword;
  formData.role = config.roleId;
  formData.businessType = config.roleId;
  errorEl.style.display = 'none';

  btn.classList.add('btn-loading');
  btn.disabled = true;
  btn.textContent = 'Registering…';

  try {
    const result = await api.register(formData);
    persistUser(result);
    setState({ user: result, demoMode: false, sessionChecked: true });

    // Optional supporting verification document upload right after registration
    const fileInput = document.getElementById('f-doc-file');
    const docTypeEl = document.getElementById('f-doc-type');
    if (fileInput?.files?.[0]) {
      try {
        await api.uploadOrgDocument(fileInput.files[0], docTypeEl?.value || 'BUSINESS_LICENSE');
        showToast('Account created & verification document uploaded!', 'success');
      } catch (uploadErr) {
        showToast(`Account created, but document upload failed: ${uploadErr.message}`, 'warning');
      }
    } else {
      showToast('Business account created! Submitted for verification.', 'success');
    }

    setTimeout(() => navigate('/pending'), 900);
  } catch (err) {
    if (err.isServerDown || (err.message && err.message.includes('fetch'))) {
      showToast('Backend not connected. Demo mode: this account was NOT saved.', 'warning');
      const demoUser = {
        id: 'demo-' + Date.now(),
        email: formData.email,
        fullName: formData.fullName,
        role: config.roleId,
        status: 'PENDING_VERIFICATION',
        businessProfile: { businessName: formData.businessName || '', city: formData.city || '', state: formData.state || '' }
      };
      persistUser(demoUser);
      setState({ demoMode: true, user: demoUser });
      setTimeout(() => navigate('/pending'), 1000);
    } else {
      errorEl.style.display = 'flex';
      errorEl.textContent = `❌ ${err.message || 'Registration failed. Please check your entries.'}`;
    }
  } finally {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
    btn.textContent = 'Submit for Business Verification →';
  }
}
