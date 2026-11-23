/**
 * SAHAYAK B2B — Lightweight State Store
 */

const _listeners = new Set();

export const store = {
  user: null,
  sessionChecked: false,
  sidebarOpen: false,
  copilotOpen: true,
  activeTab: 'overview',
  currentPage: null,
  demoMode: false,
  notifications: [],
  unreadCount: 0,
  copilotMessages: [],
  copilotLoading: false,
  currentConversationId: null,
  kaenSession: null
};

export function setState(updates) {
  Object.assign(store, updates);
  _listeners.forEach((fn) => fn(store));
}

export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function persistUser(user) {
  if (user) {
    sessionStorage.setItem('sb2b_user', JSON.stringify({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      emailVerified: Boolean(user.emailVerified),
      businessProfile: user.businessProfile || null,
      organization: user.organization || null,
      membership: user.membership || null
    }));
  } else {
    sessionStorage.removeItem('sb2b_user');
  }
}

export function restoreUser() {
  try {
    const raw = sessionStorage.getItem('sb2b_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const DEMO_USERS = {
  RETAILER: {
    id: 'demo-retailer',
    email: 'arjun@balajitextiles.in',
    fullName: 'Arjun Rao',
    role: 'RETAILER',
    status: 'ACTIVE',
    businessProfile: {
      businessName: 'Sri Balaji Textiles & Uniforms',
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      category: 'Textiles & Garments',
      gstVerified: true
    }
  },
  WHOLESALER: {
    id: 'demo-wholesaler',
    email: 'priya@krishnatrades.in',
    fullName: 'Priya Krishnan',
    role: 'WHOLESALER',
    status: 'ACTIVE',
    businessProfile: {
      businessName: 'Krishna Wholesale Traders',
      city: 'Hyderabad',
      state: 'Telangana',
      category: 'FMCG & Consumer Goods',
      gstVerified: true
    }
  },
  MANUFACTURER: {
    id: 'demo-manufacturer',
    email: 'ceo@suryafab.com',
    fullName: 'Surya Narayan',
    role: 'MANUFACTURER',
    status: 'ACTIVE',
    businessProfile: {
      businessName: 'Surya Fabrications Pvt Ltd',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      category: 'Textile Manufacturing',
      gstVerified: true
    }
  },
  LOGISTICS: {
    id: 'demo-logistics',
    email: 'ops@swiftcargo.in',
    fullName: 'Ravi Shankar',
    role: 'LOGISTICS',
    status: 'ACTIVE',
    businessProfile: {
      businessName: 'Swift Cargo Solutions',
      city: 'Chennai',
      state: 'Tamil Nadu',
      category: 'B2B Logistics',
      gstVerified: true
    }
  },
  SUPER_ADMIN: {
    id: 'demo-admin',
    email: 'admin@sahayak.in',
    fullName: 'Platform Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    businessProfile: null
  }
};
