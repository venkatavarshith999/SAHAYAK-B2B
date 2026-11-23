/**
 * SAHAYAK B2B — Role-Aware Sidebar Navigation (All 5 Primary Portals)
 * Strictly never lists Workers Portal in Business Selector or Super Admin Sidebar.
 */

import { store } from '../store.js';
import { esc } from '../utils/sanitize.js';

function getSellerNav(businessType) {
  const isMfg = businessType === 'MANUFACTURER';
  return [
    { label: 'Main', items: [
      { id: 'overview', icon: '📊', label: isMfg ? 'Manufacturer Overview' : 'Seller Overview' },
      { id: 'kaen', icon: '🤝', label: 'KAEN Negotiation' }
    ]},
    { label: 'Trade & Orders', items: [
      { id: 'rfq', icon: '📋', label: 'Incoming RFQs & Quotes' },
      { id: 'orders', icon: '🛒', label: 'Orders & Dispatch' },
      { id: 'partnerships', icon: '🌐', label: 'Partnerships' },
      { id: 'chat', icon: '💬', label: 'B2B Chat' }
    ]},
    { label: isMfg ? 'Factory & Catalogue' : 'Catalogue & Stock', items: [
      { id: 'catalogue', icon: '📦', label: 'Product Catalogue' },
      ...(isMfg ? [{ id: 'production', icon: '🏭', label: 'Production & QC' }] : [])
    ]},
    { label: 'Organization', items: [
      { id: 'team', icon: '👷', label: 'Team & Workers' },
      { id: 'branches', icon: '🏢', label: 'Profile & Branches' },
      { id: 'documents', icon: '📎', label: 'Verification Docs' }
    ]}
  ];
}

const NAV_CONFIG = {
  RETAILER: [
    { label: 'Main', items: [
      { id: 'overview', icon: '🏠', label: 'Buyer Overview' },
      { id: 'kaen', icon: '🤝', label: 'KAEN Negotiation' }
    ]},
    { label: 'Procurement', items: [
      { id: 'suppliers', icon: '🏭', label: 'Supplier Discovery' },
      { id: 'catalogue', icon: '📦', label: 'Product Discovery' },
      { id: 'rfq', icon: '📋', label: 'RFQs & Quotes' },
      { id: 'orders', icon: '🛒', label: 'Orders' },
      { id: 'requests', icon: '📝', label: 'Purchase Requests' },
      { id: 'saved', icon: '⭐', label: 'Saved Suppliers' }
    ]},
    { label: 'Collaboration', items: [
      { id: 'partnerships', icon: '🌐', label: 'Partnerships' },
      { id: 'chat', icon: '💬', label: 'B2B Chat' }
    ]},
    { label: 'Organization', items: [
      { id: 'team', icon: '👷', label: 'Team & Workers' },
      { id: 'branches', icon: '🏢', label: 'Profile & Branches' },
      { id: 'documents', icon: '📎', label: 'Verification Docs' }
    ]}
  ],

  LOGISTICS: [
    { label: 'Main', items: [
      { id: 'overview', icon: '🚚', label: 'Logistics Overview' }
    ]},
    { label: 'Operations', items: [
      { id: 'shipments', icon: '📦', label: 'Shipments & Tracking' },
      { id: 'fleet', icon: '🚛', label: 'Fleet & Vehicles' },
      { id: 'partnerships', icon: '🌐', label: 'Partnerships' },
      { id: 'chat', icon: '💬', label: 'B2B Chat' }
    ]},
    { label: 'Organization', items: [
      { id: 'team', icon: '👷', label: 'Drivers & Team' },
      { id: 'branches', icon: '🏢', label: 'Company & Branches' },
      { id: 'documents', icon: '📎', label: 'Verification Docs' }
    ]}
  ],

  WORKER: [
    { label: 'Workspace', items: [
      { id: 'overview', icon: '🏠', label: 'Worker Overview' },
      { id: 'tasks', icon: '✅', label: 'My Tasks' },
      { id: 'role-workspace', icon: '🧰', label: 'Role Workspace' }
    ]},
    { label: 'Time & Leave', items: [
      { id: 'attendance', icon: '⏱️', label: 'Attendance & Shifts' },
      { id: 'leaves', icon: '🗓️', label: 'Leave Applications' }
    ]},
    { label: 'Organization', items: [
      { id: 'org-info', icon: '🏢', label: 'My Organization' },
      { id: 'security', icon: '🔐', label: 'Login History' }
    ]}
  ],

  SUPER_ADMIN: [
    { label: 'Platform', items: [
      { id: 'overview', icon: '🖥️', label: 'Platform Overview' },
      { id: 'organizations', icon: '🏢', label: 'Organizations' },
      { id: 'analytics', icon: '📊', label: 'Analytics & Reports' }
    ]},
    { label: 'Governance', items: [
      { id: 'users', icon: '👥', label: 'User Management' },
      { id: 'verification', icon: '✅', label: 'Business Verification' },
      { id: 'logistics-mgmt', icon: '🚚', label: 'Logistics Partners' }
    ]},
    { label: 'Operations', items: [
      { id: 'transactions', icon: '💳', label: 'Transactions' },
      { id: 'disputes', icon: '⚖️', label: 'Disputes' },
      { id: 'ai-usage', icon: '🤖', label: 'AI Monitoring' }
    ]},
    { label: 'System', items: [
      { id: 'admin-mgmt', icon: '🛡️', label: 'Admin Management' },
      { id: 'audit', icon: '📋', label: 'Audit Logs' },
      { id: 'settings', icon: '⚙️', label: 'Platform Settings' }
    ]}
  ],

  VERIFICATION_ADMIN: [
    { label: 'Verification', items: [
      { id: 'overview', icon: '🖥️', label: 'Overview' },
      { id: 'verification', icon: '✅', label: 'Business Verification' },
      { id: 'organizations', icon: '🏢', label: 'Organizations' },
      { id: 'users', icon: '👥', label: 'Users' },
      { id: 'audit', icon: '📋', label: 'Audit Logs' }
    ]}
  ],

  FINANCE_ADMIN: [
    { label: 'Finance', items: [
      { id: 'overview', icon: '🖥️', label: 'Overview' },
      { id: 'transactions', icon: '💳', label: 'Transactions' },
      { id: 'analytics', icon: '📊', label: 'Analytics' },
      { id: 'audit', icon: '📋', label: 'Audit Logs' }
    ]}
  ],

  OPERATIONS_ADMIN: [
    { label: 'Operations', items: [
      { id: 'overview', icon: '🖥️', label: 'Overview' },
      { id: 'organizations', icon: '🏢', label: 'Organizations' },
      { id: 'users', icon: '👥', label: 'Users' },
      { id: 'audit', icon: '📋', label: 'Audit Logs' }
    ]}
  ],

  SUPPORT_ADMIN: [
    { label: 'Support', items: [
      { id: 'overview', icon: '🖥️', label: 'Overview' },
      { id: 'disputes', icon: '⚖️', label: 'Disputes' },
      { id: 'users', icon: '👥', label: 'Users' },
      { id: 'audit', icon: '📋', label: 'Audit Logs' }
    ]}
  ],

  LOGISTICS_ADMIN: [
    { label: 'Logistics', items: [
      { id: 'overview', icon: '🖥️', label: 'Overview' },
      { id: 'logistics-mgmt', icon: '🚚', label: 'Logistics Partners' },
      { id: 'organizations', icon: '🏢', label: 'Organizations' },
      { id: 'audit', icon: '📋', label: 'Audit Logs' }
    ]}
  ],

  ANALYTICS_ADMIN: [
    { label: 'Analytics', items: [
      { id: 'overview', icon: '🖥️', label: 'Overview' },
      { id: 'analytics', icon: '📊', label: 'Analytics' },
      { id: 'ai-usage', icon: '🤖', label: 'AI Monitoring' }
    ]}
  ]
};

export function renderSidebar(container, activeTab, onTabChange, onLogout) {
  const { user } = store;
  if (!user) return;

  const isSeller = ['WHOLESALER', 'MANUFACTURER', 'DISTRIBUTOR', 'SUPPLIER'].includes(user.role);
  const bizType = user.organization?.businessType || user.role;
  const navSections = isSeller ? getSellerNav(bizType) : (NAV_CONFIG[user.role] || NAV_CONFIG.RETAILER);
  const initials = user.fullName?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
  const subLabel = user.role === 'WORKER'
    ? (user.organization?.name || 'Worker Portal')
    : (user.organization?.name || user.businessProfile?.businessName || user.email);

  container.innerHTML = `
    <aside class="sidebar" id="app-sidebar">
      <div class="sidebar-logo" style="display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="navigate('/dashboard')">
        <img src="/logo.jpg" alt="Sahayak Logo" style="width:40px;height:40px;object-fit:contain;" />
        <div>
          <div class="sidebar-brand" style="font-size:17px;font-weight:900;letter-spacing:-0.02em;background:linear-gradient(135deg,#581c87,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1.2;">SAHAYAK <span style="color:#06b6d4;-webkit-text-fill-color:#06b6d4;">B2B</span></div>
          <div class="sidebar-tagline" style="font-size:11px;color:var(--color-text-muted);font-weight:500;">${esc(getRoleLabel(user.role, user.membership?.workerRole))}</div>
        </div>
      </div>

      <nav class="sidebar-nav">
        ${navSections.map((section) => `
          <div class="nav-section-label">${esc(section.label)}</div>
          ${section.items.map((item) => `
            <button
              class="nav-item ${activeTab === item.id ? 'active' : ''}"
              onclick="window.__sidebarNav('${item.id}')"
              id="nav-${item.id}"
            >
              <span class="nav-item-icon">${item.icon}</span>
              <span>${esc(item.label)}</span>
            </button>
          `).join('')}
        `).join('')}
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="avatar avatar-sm">${esc(initials)}</div>
          <div style="min-width:0;flex:1;">
            <div class="sidebar-user-name">${esc(user.fullName)}</div>
            <div class="sidebar-user-role" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(subLabel)}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm btn-full" style="margin-top:8px;" onclick="window.__sidebarLogout()">
          Sign Out
        </button>
      </div>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div>
  `;

  window.__sidebarNav = (tabId) => {
    closeSidebar();
    onTabChange(tabId);
  };
  window.__sidebarLogout = onLogout;
  window.openSidebar = () => {
    document.getElementById('app-sidebar')?.classList.add('open');
    document.getElementById('sidebar-overlay')?.classList.add('show');
  };
  window.closeSidebar = () => {
    document.getElementById('app-sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');
  };
}

function getRoleLabel(role, workerRole) {
  if (role === 'WORKER') {
    return workerRole ? `Worker · ${workerRole.replace(/_/g, ' ')}` : 'Workers Portal';
  }
  const labels = {
    RETAILER: 'Buyer Portal',
    WHOLESALER: 'Seller · Wholesaler',
    MANUFACTURER: 'Seller · Manufacturer',
    DISTRIBUTOR: 'Seller · Distributor',
    SUPPLIER: 'Seller · Supplier',
    LOGISTICS: 'Logistics Portal',
    SUPER_ADMIN: 'Super Admin Portal',
    VERIFICATION_ADMIN: 'Verification Admin',
    FINANCE_ADMIN: 'Finance Admin',
    OPERATIONS_ADMIN: 'Operations Admin',
    SUPPORT_ADMIN: 'Support Admin',
    LOGISTICS_ADMIN: 'Logistics Admin',
    ANALYTICS_ADMIN: 'Analytics Admin'
  };
  return labels[role] || role;
}
