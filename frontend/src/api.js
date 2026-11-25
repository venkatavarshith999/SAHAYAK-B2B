/**
 * SAHAYAK B2B — Backend API Client
 * All API calls go through here. Supports demo mode fallback.
 */

import { store } from './store.js';

const BASE = '/api';

async function request(method, path, body, options = {}) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const isServerDown = res.status >= 500 || res.status === 404;
    const msg = data.error || (isServerDown ? `Backend service unreachable (${res.status})` : `Request failed: ${res.status}`);
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    err.isServerDown = isServerDown;
    throw err;
  }
  return data;
}

export const api = {
  // ── Auth ──────────────────────────────────────
  async register(payload) {
    return request('POST', '/auth/register', payload);
  },

  async login(email, password) {
    return request('POST', '/auth/login', { email, password });
  },

  async workerLogin(email, password) {
    return request('POST', '/auth/worker/login', { email, password });
  },

  async workerJoin(payload) {
    return request('POST', '/auth/worker/join', payload);
  },

  async verifyEmail(token) {
    return request('POST', '/auth/verify-email', { token });
  },

  async resendVerification() {
    return request('POST', '/auth/resend-verification');
  },

  async getLoginHistory() {
    return request('GET', '/auth/login-history');
  },

  async logout() {
    return request('POST', '/auth/logout');
  },

  async me() {
    return request('GET', '/me');
  },

  async forgotPassword(email) {
    return request('POST', '/auth/forgot-password', { email });
  },

  async resetPassword(token, password) {
    return request('POST', '/auth/reset-password', { token, password });
  },

  googleRedirectUrl() {
    return `${BASE}/auth/google/redirect`;
  },

  async googleStatus() {
    return request('GET', '/auth/google/status');
  },

  async googlePending() {
    return request('GET', '/auth/google/pending');
  },

  async googleLink(password) {
    return request('POST', '/auth/google/link', { password });
  },

  async googleComplete(payload) {
    return request('POST', '/auth/google/complete', payload);
  },

  async googleCancel() {
    return request('POST', '/auth/google/cancel');
  },

  async googleCallback(idToken, selectedRole, linkPassword) {
    return request('POST', '/auth/google', { idToken, selectedRole, linkPassword });
  },

  // ── AI ────────────────────────────────────────
  async chat(prompt, history = [], conversationId = null) {
    return request('POST', '/ai/chat', { prompt, history, conversationId });
  },

  // ── KAEN ──────────────────────────────────────
  async negotiate(payload) {
    return request('POST', '/kaen/negotiate', payload);
  },

  // ── Notifications ─────────────────────────────
  async getNotifications() {
    return request('GET', '/notifications');
  },

  async markNotificationRead(id) {
    return request('POST', `/notifications/${id}/read`);
  },

  // ── Conversations ─────────────────────────────
  async getConversations() {
    return request('GET', '/conversations');
  },

  async createConversation(title) {
    return request('POST', '/conversations', { title });
  },

  async getMessages(conversationId) {
    return request('GET', `/conversations/${conversationId}/messages`);
  },

  // ── Admin ─────────────────────────────────────
  async getAdminStats() {
    return request('GET', '/admin/stats');
  },

  async getUsers(params = {}) {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/admin/users${q ? '?' + q : ''}`);
  },

  async getVerificationQueue(status = '') {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return request('GET', `/admin/verifications${q}`);
  },

  async getUserLoginHistory(id) {
    return request('GET', `/admin/users/${id}/login-history`);
  },

  async setUserStatus(id, status, reason) {
    return request('PATCH', `/admin/users/${id}/status`, { status, reason });
  },

  async approveVerification(id, notes) {
    return request('POST', `/admin/verifications/${id}/approve`, { notes });
  },

  async rejectVerification(id, notes) {
    return request('POST', `/admin/verifications/${id}/reject`, { notes });
  },

  async requestVerificationDocs(id, notes) {
    return request('POST', `/admin/verifications/${id}/request-docs`, { notes });
  },

  async holdVerification(id, notes) {
    return request('POST', `/admin/verifications/${id}/hold`, { notes });
  },

  async getAdminAiUsage() {
    return request('GET', '/admin/ai-usage');
  },

  async getAuditLogs(params = {}) {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/admin/audit-logs${q ? '?' + q : ''}`);
  },

  async getAdmins() {
    return request('GET', '/admin/admins');
  },

  async createAdmin(payload) {
    return request('POST', '/admin/admins', payload);
  },

  async updateAdminRole(id, role) {
    return request('PATCH', `/admin/admins/${id}/role`, { role });
  },

  async getAdminOrganizations(params = {}) {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/admin/organizations${q ? '?' + q : ''}`);
  },

  async getAdminLogisticsPartners() {
    return request('GET', '/admin/logistics-partners');
  },

  // ── Organization & Worker Onboarding ──────────
  async getOrgProfile() {
    return request('GET', '/org/profile');
  },

  async updateOrgProfile(payload) {
    return request('PATCH', '/org/profile', payload);
  },

  // ── Workers Portal ────────────────────────────
  async getWorkerDashboard() {
    return request('GET', '/worker/dashboard');
  },

  async getWorkerTasks(scope = 'mine') {
    return request('GET', `/worker/tasks?scope=${encodeURIComponent(scope)}`);
  },

  async createWorkerTask(payload) {
    return request('POST', '/worker/tasks', payload);
  },

  async updateWorkerTask(id, payload) {
    return request('PATCH', `/worker/tasks/${id}`, payload);
  },

  async getWorkerAttendance() {
    return request('GET', '/worker/attendance');
  },

  async checkInAttendance(payload = {}) {
    return request('POST', '/worker/attendance/check-in', payload);
  },

  async checkOutAttendance() {
    return request('POST', '/worker/attendance/check-out');
  },

  async getTeamAttendance() {
    return request('GET', '/worker/attendance/team');
  },

  async getWorkerLeaves(scope = 'mine') {
    return request('GET', `/worker/leaves?scope=${encodeURIComponent(scope)}`);
  },

  async applyLeave(payload) {
    return request('POST', '/worker/leaves', payload);
  },

  async reviewLeave(id, status, notes = '') {
    return request('PATCH', `/worker/leaves/${id}/review`, { status, notes });
  },

  // ── Seller Portal ─────────────────────────────
  async getSellerOverview() {
    return request('GET', '/seller/overview');
  },

  async getSellerProducts(params = {}) {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/seller/products${q ? '?' + q : ''}`);
  },

  async createSellerProduct(payload) {
    return request('POST', '/seller/products', payload);
  },

  async updateSellerProduct(id, payload) {
    return request('PATCH', `/seller/products/${id}`, payload);
  },

  async deleteSellerProduct(id) {
    return request('DELETE', `/seller/products/${id}`);
  },

  async getProductionOrders() {
    return request('GET', '/seller/production-orders');
  },

  async createProductionOrder(payload) {
    return request('POST', '/seller/production-orders', payload);
  },

  async updateProductionOrder(id, payload) {
    return request('PATCH', `/seller/production-orders/${id}`, payload);
  },

  // ── Buyer Portal ──────────────────────────────
  async getBuyerOverview() {
    return request('GET', '/buyer/overview');
  },

  async discoverSuppliers(params = {}) {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/buyer/suppliers${q ? '?' + q : ''}`);
  },

  async discoverProducts(params = {}) {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/buyer/products${q ? '?' + q : ''}`);
  },

  async getSavedSuppliers() {
    return request('GET', '/buyer/saved-suppliers');
  },

  async saveSupplier(supplierOrgId, notes = '') {
    return request('POST', '/buyer/saved-suppliers', { supplierOrgId, notes });
  },

  async removeSavedSupplier(supplierOrgId) {
    return request('DELETE', `/buyer/saved-suppliers/${supplierOrgId}`);
  },

  async getPurchaseRequests() {
    return request('GET', '/buyer/purchase-requests');
  },

  async createPurchaseRequest(payload) {
    return request('POST', '/buyer/purchase-requests', payload);
  },

  async updatePurchaseRequest(id, payload) {
    return request('PATCH', `/buyer/purchase-requests/${id}`, payload);
  },

  // ── Logistics Portal ──────────────────────────
  async getLogisticsOverview() {
    return request('GET', '/logistics/overview');
  },

  async getVehicles() {
    return request('GET', '/logistics/vehicles');
  },

  async createVehicle(payload) {
    return request('POST', '/logistics/vehicles', payload);
  },

  async updateVehicle(id, payload) {
    return request('PATCH', `/logistics/vehicles/${id}`, payload);
  },

  async getShipments(params = {}) {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/logistics/shipments${q ? '?' + q : ''}`);
  },

  async createShipment(payload) {
    return request('POST', '/logistics/shipments', payload);
  },

  async updateShipment(id, payload) {
    return request('PATCH', `/logistics/shipments/${id}`, payload);
  },

  // ── Phase D: Partnerships ─────────────────────
  async discoverPartners(params = {}) {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/partnerships/discover${q ? '?' + q : ''}`);
  },
  async getPartnerships() {
    return request('GET', '/partnerships');
  },
  async createPartnership(payload) {
    return request('POST', '/partnerships', payload);
  },
  async reviewPartnership(id, action, notes = '') {
    return request('PATCH', `/partnerships/${id}/review`, { action, notes });
  },
  async respondPartnership(id, response) {
    return request('POST', `/partnerships/${id}/respond`, { response });
  },

  // ── Phase D: RFQs & Quotations ────────────────
  async getRfqs(view = '') {
    const q = view ? `?view=${encodeURIComponent(view)}` : '';
    return request('GET', `/rfqs${q}`);
  },
  async createRfq(payload) {
    return request('POST', '/rfqs', payload);
  },
  async cancelRfq(id) {
    return request('PATCH', `/rfqs/${id}/cancel`);
  },
  async submitQuotation(rfqId, payload) {
    return request('POST', `/rfqs/${rfqId}/quotations`, payload);
  },
  async reviseQuotation(quotationId, payload) {
    return request('PATCH', `/rfqs/quotations/${quotationId}`, payload);
  },
  async acceptQuotation(quotationId) {
    return request('POST', `/rfqs/quotations/${quotationId}/accept`);
  },
  async rejectQuotation(quotationId, reason = '') {
    return request('POST', `/rfqs/quotations/${quotationId}/reject`, { reason });
  },

  // ── Phase D: Persistent KAEN Sessions ─────────
  async getKaenSessions() {
    return request('GET', '/kaen/sessions');
  },
  async startKaenSession(payload) {
    return request('POST', '/kaen/sessions', payload);
  },
  async submitKaenOffer(sessionId, payload) {
    return request('POST', `/kaen/sessions/${sessionId}/offer`, payload);
  },
  async confirmKaenSession(sessionId) {
    return request('POST', `/kaen/sessions/${sessionId}/confirm`);
  },
  async cancelKaenSession(sessionId) {
    return request('POST', `/kaen/sessions/${sessionId}/cancel`);
  },

  // ── Phase D: Shared B2B Chat ──────────────────
  async getB2bConversations() {
    return request('GET', '/chat/conversations');
  },
  async openB2bConversation(targetOrgId, subject = '') {
    return request('POST', '/chat/conversations', { targetOrgId, subject });
  },
  async getB2bMessages(conversationId, search = '') {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return request('GET', `/chat/conversations/${conversationId}/messages${q}`);
  },
  async sendB2bMessage(conversationId, { body = '', file = null, refType = null, refId = null, refLabel = null }) {
    if (file) {
      const fd = new FormData();
      fd.append('file', file);
      if (body) fd.append('body', body);
      if (refType) fd.append('refType', refType);
      if (refId) fd.append('refId', refId);
      if (refLabel) fd.append('refLabel', refLabel);
      const res = await fetch(`${BASE}/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        credentials: 'include',
        body: fd
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to send attachment (${res.status})`);
      return data;
    }
    return request('POST', `/chat/conversations/${conversationId}/messages`, { body, refType, refId, refLabel });
  },

  // ── Phase D: Orders & Logistics Dispatch ──────
  async getOrders() {
    return request('GET', '/orders');
  },
  async createOrderFromQuotation(quotationId, deliveryAddress = '') {
    return request('POST', `/orders/from-quotation/${quotationId}`, { deliveryAddress });
  },
  async createOrderFromNegotiation(sessionId, deliveryAddress = '') {
    return request('POST', `/orders/from-negotiation/${sessionId}`, { deliveryAddress });
  },
  async updateOrderStatus(orderId, payload) {
    return request('PATCH', `/orders/${orderId}/status`, payload);
  },
  async requestOrderShipment(orderId, payload) {
    return request('POST', `/orders/${orderId}/request-shipment`, payload);
  },
  async getDispatchLogisticsPartners() {
    return request('GET', '/orders/logistics-partners');
  },

  // ── Admin Live Orders & Partnerships ──────────
  async getAdminOrders() {
    return request('GET', '/admin/orders');
  },
  async getAdminPartnerships() {
    return request('GET', '/admin/partnerships');
  },

  async getBranches() {
    return request('GET', '/org/branches');
  },

  async createBranch(payload) {
    return request('POST', '/org/branches', payload);
  },

  async getInvitations() {
    return request('GET', '/org/invitations');
  },

  async inviteWorker(payload) {
    return request('POST', '/org/invitations', payload);
  },

  async revokeInvitation(id) {
    return request('DELETE', `/org/invitations/${id}`);
  },

  async getOrgMembers() {
    return request('GET', '/org/members');
  },

  async updateOrgMember(id, payload) {
    return request('PATCH', `/org/members/${id}`, payload);
  },

  async getOrgDocuments() {
    return request('GET', '/org/documents');
  },

  async uploadOrgDocument(file, docType = 'BUSINESS_LICENSE', expiryDate = '') {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docType', docType);
    if (expiryDate) fd.append('expiryDate', expiryDate);
    const res = await fetch(`${BASE}/org/documents`, {
      method: 'POST',
      credentials: 'include',
      body: fd
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Upload failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  },
};

// ── Demo Mode Data (shown when backend unavailable) ────────────
export const demoData = {
  adminStats: {
    totalUsers: 2847,
    activeBusinesses: 1943,
    verifiedBusinesses: 1621,
    pendingVerification: 234,
    activeTransactions: 418,
    monthlyRevenue: 2840000,
    openDisputes: 12,
    totalOrders: 8903
  },

  notifications: [
    { id: '1', title: 'New Quotation Received', body: 'Sri Ram Textiles sent a quote for 500 cotton shirts', isRead: false, createdAt: new Date(Date.now() - 3600000).toISOString() },
    { id: '2', title: 'KAEN Negotiation Update', body: 'Round 3 counter-offer submitted by seller', isRead: false, createdAt: new Date(Date.now() - 7200000).toISOString() },
    { id: '3', title: 'Order Shipped', body: 'Your order #ORD-8821 has been dispatched via Swift Cargo', isRead: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: '4', title: 'Business Verified ✓', body: 'Congratulations! Your GSTIN has been verified by platform admin', isRead: true, createdAt: new Date(Date.now() - 172800000).toISOString() },
  ],

  retailerMetrics: {
    activeRFQs: 14,
    pendingOrders: 7,
    kaenSavings: '11.4%',
    suppliersConnected: 38,
    monthlySpend: '₹4.2L',
    inTransit: 6
  },

  wholesalerMetrics: {
    activeListings: 128,
    pendingEnquiries: 23,
    monthlyRevenue: '₹18.6L',
    repeatBuyers: 47,
    pendingQuotations: 11,
    ordersThisMonth: 94
  },

  manufacturerMetrics: {
    productionCapacity: '78%',
    activeOrders: 32,
    pendingRFQs: 19,
    distributorConnections: 24,
    monthlyOutput: '₹42L',
    supplyAgreements: 8
  },

  logisticsMetrics: {
    activeShipments: 67,
    pendingPickups: 12,
    deliveredToday: 23,
    onTimeRate: '94.2%',
    monthlyRevenue: '₹8.4L',
    vehicleFleet: 18
  },

  trendingProducts: [
    { name: 'Cotton School Uniforms (Set)', demand: 'Very High', trend: '+34%', category: 'Apparel', icon: '👕' },
    { name: 'Stationery Bulk Pack', demand: 'High', trend: '+22%', category: 'Education', icon: '📒' },
    { name: 'Steel Water Bottles (500ml)', demand: 'High', trend: '+18%', category: 'Kitchenware', icon: '🫙' },
    { name: 'LED Study Lamps', demand: 'Medium', trend: '+12%', category: 'Electronics', icon: '💡' },
    { name: 'Backpacks (Medium)', demand: 'Very High', trend: '+41%', category: 'Accessories', icon: '🎒' },
    { name: 'Geometry Box (Premium)', demand: 'Medium', trend: '+9%', category: 'Education', icon: '📐' },
  ],

  recentOrders: [
    { id: 'ORD-9021', product: '500 Cotton School Shirts', supplier: 'Sri Ram Textiles', amount: '₹1,32,500', status: 'In Transit', date: '2026-11-19' },
    { id: 'ORD-8990', product: '200 Steel Water Bottles', supplier: 'Apex Metalworks', amount: '₹28,000', status: 'Delivered', date: '2026-11-17' },
    { id: 'ORD-8821', product: '100 Backpacks (Bulk)', supplier: 'Krishna Bags Co.', amount: '₹45,000', status: 'Processing', date: '2026-11-15' },
  ],

  kaenSession: {
    id: 'kaen-demo-001',
    product: 'Cotton School Uniforms (500 units)',
    round: 2,
    maxRounds: 5,
    buyerOffer: 265,
    sellerAsk: 298,
    sellerFloor: 275,
    buyerMax: 285,
    quantity: 500,
    history: [
      { round: 1, buyer: 250, seller: 310, note: 'Initial RFQ bulk tier quote (500 units)', status: 'COUNTER_OFFER' },
      { round: 2, buyer: 265, seller: 298, note: 'KAEN concession curve applied (-3.9%)', status: 'COUNTER_OFFER' }
    ]
  },

  adminUsers: [
    { id: 'u1', fullName: 'Arjun Rao', email: 'arjun@balajitextiles.in', role: 'RETAILER', status: 'ACTIVE', createdAt: '2026-10-01', businessProfile: { businessName: 'Sri Balaji Textiles', city: 'Vijayawada' } },
    { id: 'u2', fullName: 'Priya Krishnan', email: 'priya@krishnatrades.in', role: 'WHOLESALER', status: 'ACTIVE', createdAt: '2026-09-15', businessProfile: { businessName: 'Krishna Wholesale Traders', city: 'Hyderabad' } },
    { id: 'u3', fullName: 'Ravi Sharma', email: 'ravi@greenhorti.com', role: 'MANUFACTURER', status: 'PENDING_VERIFICATION', createdAt: '2026-11-10', businessProfile: { businessName: 'Green Horticulture Pvt Ltd', city: 'Pune' } },
    { id: 'u4', fullName: 'Anjali Nair', email: 'anjali@fastfreight.in', role: 'LOGISTICS', status: 'ACTIVE', createdAt: '2026-08-20', businessProfile: { businessName: 'Fast Freight Solutions', city: 'Kochi' } },
    { id: 'u5', fullName: 'Mohan Das', email: 'mohan@texfab.in', role: 'WHOLESALER', status: 'REJECTED', createdAt: '2026-11-01', businessProfile: { businessName: 'Tex Fab Industries', city: 'Surat' } },
  ],

  auditLogs: [
    { id: 'al1', action: 'APPROVE_KYC', targetEntity: 'BusinessVerification', actorId: 'admin-001', createdAt: new Date(Date.now() - 3600000).toISOString(), details: { businessName: 'Sri Balaji Textiles' } },
    { id: 'al2', action: 'REJECT_KYC', targetEntity: 'BusinessVerification', actorId: 'admin-001', createdAt: new Date(Date.now() - 7200000).toISOString(), details: { businessName: 'Tex Fab Industries', reason: 'Invalid GSTIN' } },
    { id: 'al3', action: 'SUSPEND_USER', targetEntity: 'User', actorId: 'admin-001', createdAt: new Date(Date.now() - 86400000).toISOString(), details: { email: 'fraudster@test.com' } },
  ],

  logisticsShipments: [
    { id: 'SHP-5021', origin: 'Hyderabad', destination: 'Vijayawada', client: 'Sri Balaji Textiles', weight: '240 kg', status: 'In Transit', eta: '2026-11-21', amount: '₹3,200' },
    { id: 'SHP-5019', origin: 'Coimbatore', destination: 'Chennai', client: 'Surya Fabrications', weight: '580 kg', status: 'Delivered', eta: '2026-11-19', amount: '₹7,100' },
    { id: 'SHP-5017', origin: 'Surat', destination: 'Hyderabad', client: 'Krishna Wholesale', weight: '320 kg', status: 'Pickup Pending', eta: '2026-11-22', amount: '₹4,500' },
  ],

  manufacturerOrders: [
    { id: 'BK-301', buyer: 'Sunrise Distributors', product: 'Cotton Fabric (10,000m)', quantity: '10,000 metres', amount: '₹8.4L', status: 'In Production', deadline: '2026-12-05' },
    { id: 'BK-299', buyer: 'Metro Retail Group', product: 'School Uniform Sets', quantity: '2,500 sets', amount: '₹6.25L', status: 'Dispatched', deadline: '2026-11-25' },
    { id: 'BK-295', buyer: 'Pradesh Traders', product: 'Linen Fabric (5,000m)', quantity: '5,000 metres', amount: '₹3.75L', status: 'Completed', deadline: '2026-11-15' },
  ],
};
