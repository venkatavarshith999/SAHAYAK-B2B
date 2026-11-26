/**
 * SAHAYAK B2B — Business Registration Forms (Buyer, Seller [Wholesaler/Manufacturer/Distributor/Supplier], Logistics)
 * Conditional compliance fields + optional immediate verification document upload.
 */

import { navigate } from '../router.js';
import { api } from '../api.js';
import { showToast } from '../components/toast.js';
import { setState, persistUser, broadcastSessionIdentity } from '../store.js';

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

export default function renderRegister(container, params, query = {}) {
  const roleKey = (params?.role || 'retailer').toLowerCase();
  const config = ROLE_CONFIGS[roleKey] || ROLE_CONFIGS.retailer;
  const isGoogleSignup = Boolean(query?.google);
  const visibleFields = isGoogleSignup
    ? config.fields.filter((f) => f.id !== 'password' && f.id !== 'confirmPassword')
    : config.fields;

  container.innerHTML = `
    <div class="auth-layout">
      <div class="auth-panel-left" style="padding:36px 24px;overflow-y:auto;">
        <div style="max-width:560px;width:100%;margin:0 auto;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
            <button onclick="navigate('${isGoogleSignup ? '/role-select?google=1' : '/role-select'}')" class="btn btn-ghost btn-sm" style="padding:0;gap:6px;">
              ← Back
            </button>
            <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="navigate('/')">
              <img src="/logo.jpg" alt="Sahayak Logo" style="width:40px;height:40px;object-fit:contain;" />
              <span style="font-size:18px;font-weight:900;letter-spacing:-0.03em;">SAHAYAK <span style="color:var(--color-primary);">B2B</span></span>
            </div>
          </div>

          <div style="margin-bottom:24px;">
            <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:var(--color-brand-100);border-radius:var(--radius-full);margin-bottom:14px;">
              <span style="font-size:18px;">${config.icon}</span>
              <span style="font-size:var(--text-xs);font-weight:800;color:var(--color-primary);text-transform:uppercase;letter-spacing:0.06em;">${config.portalBadge}</span>
            </div>
            <h1 style="font-size:var(--text-3xl);font-weight:900;letter-spacing:-0.03em;margin-bottom:8px;">Register as <span style="color:var(--color-primary);">${config.title}</span></h1>
            <p style="color:var(--color-text-muted);font-size:var(--text-sm);">${config.desc}</p>
          </div>

          ${isGoogleSignup ? `
            <div id="reg-google-banner" class="alert alert-info" style="margin-bottom:18px;display:flex;align-items:center;gap:10px;">
              <svg width="18" height="18" viewBox="0 0 24 24" style="flex-shrink:0;">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span id="reg-google-banner-text" style="font-size:var(--text-xs);">Verifying your Google session…</span>
            </div>
          ` : `
            <div style="margin-bottom:20px;">
              <a href="/api/auth/google/redirect" id="btn-reg-google" class="btn btn-google btn-full btn-lg" style="text-decoration:none;">
                <svg width="20" height="20" viewBox="0 0 24 24" style="margin-right:8px;">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Continue with Google
              </a>
              <div class="divider" style="margin:18px 0 4px;">or register with email &amp; password</div>
            </div>
          `}

          <form id="reg-form" onsubmit="window.__regSubmit(event)" novalidate>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;" id="form-fields">
              ${visibleFields.map((field) => renderField(field)).join('')}
            </div>

            <!-- Optional Verification Document Upload -->
            <div style="margin-top:18px;padding:16px;border-radius:var(--radius-md);border:1px dashed var(--color-brand-200,#ddd6fe);background:var(--color-brand-50,#f5f3ff);">
              <label class="form-label" for="f-doc-file" style="margin-bottom:6px;display:block;">
                📎 Supporting Business Document (Optional now · PDF, JPG, PNG up to 5MB)
              </label>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
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
              ${isGoogleSignup ? 'Complete Google Business Registration →' : 'Submit for Business Verification →'}
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

  if (isGoogleSignup) {
    const bannerText = document.getElementById('reg-google-banner-text');
    const errorEl = document.getElementById('reg-error');
    const nameInput = document.getElementById('f-fullName');
    const emailInput = document.getElementById('f-email');
    api.googlePending()
      .then((pending) => {
        if (pending?.mode === 'REGISTER') {
          if (nameInput && !nameInput.value) nameInput.value = pending.fullName || '';
          if (emailInput) {
            emailInput.value = pending.email || '';
            emailInput.readOnly = true;
            emailInput.style.background = '#F3F4F6';
            emailInput.style.cursor = 'not-allowed';
          }
          if (bannerText) {
            bannerText.textContent = `Google Verified: ${pending.fullName} (${pending.email}). No password needed — complete your business details below.`;
          }
        } else if (errorEl) {
          errorEl.style.display = 'flex';
          errorEl.textContent = '❌ Your Google sign-in session has expired. Please click Sign in with Google again.';
        }
      })
      .catch(() => {
        if (errorEl) {
          errorEl.style.display = 'flex';
          errorEl.textContent = '❌ Your Google sign-in session has expired. Please return to Login and sign in with Google again.';
        }
      });
  } else {
    const regGoogleBtn = document.getElementById('btn-reg-google');
    if (regGoogleBtn) {
      regGoogleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        regGoogleBtn.classList.add('btn-loading');
        window.location.href = api.googleRedirectUrl();
      });
    }
  }

  window.__regSubmit = (e) => handleRegister(e, config, visibleFields, isGoogleSignup);
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

async function handleRegister(e, config, visibleFields = config.fields, isGoogleSignup = false) {
  e.preventDefault();
  const btn = document.getElementById('reg-submit');
  const errorEl = document.getElementById('reg-error');

  const formData = {};
  for (const field of visibleFields) {
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

  if (!isGoogleSignup) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email || '')) {
      errorEl.style.display = 'flex';
      errorEl.textContent = '❌ Please enter a valid business email address.';
      return;
    }

    if (formData.confirmPassword && formData.password !== formData.confirmPassword) {
      errorEl.style.display = 'flex';
      errorEl.textContent = '❌ Passwords do not match.';
      return;
    }
    if (!formData.password || formData.password.length < 8) {
      errorEl.style.display = 'flex';
      errorEl.textContent = '❌ Password must be at least 8 characters.';
      return;
    }
    delete formData.confirmPassword;
  } else {
    delete formData.email; // Verified email comes strictly from HttpOnly signed Google cookie on server
  }

  formData.role = config.roleId;
  formData.businessType = config.roleId;
  errorEl.style.display = 'none';

  btn.classList.add('btn-loading');
  btn.disabled = true;
  btn.textContent = 'Registering…';

  try {
    const res = isGoogleSignup
      ? await api.googleComplete(formData)
      : await api.register(formData);
    const result = res.user || res;
    persistUser(result);
    broadcastSessionIdentity(result);
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
      showToast(
        isGoogleSignup
          ? 'Google business account created! Submitted for verification.'
          : 'Business account created! Submitted for verification.',
        'success'
      );
    }

    setTimeout(() => navigate('/pending'), 900);
  } catch (err) {
    if (!isGoogleSignup && (err.isServerDown || (err.message && err.message.includes('fetch')))) {
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
    btn.textContent = isGoogleSignup
      ? 'Complete Google Business Registration →'
      : 'Submit for Business Verification →';
  }
}
