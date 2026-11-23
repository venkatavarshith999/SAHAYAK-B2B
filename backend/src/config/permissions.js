/**
 * SAHAYAK B2B — Centralized RBAC & Organization Permission Definitions
 * All authorization checks are enforced on the backend using these maps.
 */

export const ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'VERIFICATION_ADMIN',
  'FINANCE_ADMIN',
  'OPERATIONS_ADMIN',
  'SUPPORT_ADMIN',
  'LOGISTICS_ADMIN',
  'ANALYTICS_ADMIN'
]);

export const PUBLIC_BUSINESS_TYPES = new Set([
  'RETAILER',
  'WHOLESALER',
  'MANUFACTURER',
  'DISTRIBUTOR',
  'SUPPLIER',
  'LOGISTICS'
]);

export function mapBusinessTypeToPortal(businessType) {
  if (businessType === 'RETAILER') return 'BUYER';
  if (businessType === 'LOGISTICS') return 'LOGISTICS';
  if (['WHOLESALER', 'MANUFACTURER', 'DISTRIBUTOR', 'SUPPLIER'].includes(businessType)) {
    return 'SELLER';
  }
  return null;
}

export const ROLE_PERMISSIONS = {
  // Administrative Roles
  SUPER_ADMIN: ['*'],
  VERIFICATION_ADMIN: [
    'VIEW_ADMIN', 'VIEW_KYC', 'APPROVE_KYC', 'REJECT_KYC', 'REQUEST_DOCS', 'HOLD_KYC', 'VIEW_USERS', 'USE_AI'
  ],
  FINANCE_ADMIN: [
    'VIEW_ADMIN', 'VIEW_FINANCE', 'MANAGE_SETTLEMENTS', 'MANAGE_COMMISSIONS', 'VIEW_ANALYTICS', 'EXPORT_REPORTS', 'USE_AI'
  ],
  OPERATIONS_ADMIN: [
    'VIEW_ADMIN', 'VIEW_USERS', 'VIEW_PARTNERSHIPS', 'INVESTIGATE_PARTNERSHIPS', 'MANAGE_CATEGORIES', 'VIEW_ANALYTICS', 'USE_AI'
  ],
  SUPPORT_ADMIN: [
    'VIEW_ADMIN', 'VIEW_USERS', 'VIEW_DISPUTES', 'RESOLVE_DISPUTE', 'MANAGE_TICKETS', 'USE_AI'
  ],
  LOGISTICS_ADMIN: [
    'VIEW_ADMIN', 'VIEW_LOGISTICS', 'MANAGE_LOGISTICS_PARTNERS', 'VIEW_SHIPMENTS', 'USE_AI'
  ],
  ANALYTICS_ADMIN: [
    'VIEW_ADMIN', 'VIEW_ANALYTICS', 'VIEW_AI_USAGE', 'EXPORT_REPORTS', 'USE_AI'
  ],

  // Business Owner Roles
  RETAILER: ['BUYER_PORTAL', 'RETAILER_PORTAL', 'USE_AI', 'USE_KAEN'],
  WHOLESALER: ['SELLER_PORTAL', 'WHOLESALER_PORTAL', 'USE_AI', 'USE_KAEN'],
  MANUFACTURER: ['SELLER_PORTAL', 'MANUFACTURER_PORTAL', 'USE_AI', 'USE_KAEN'],
  DISTRIBUTOR: ['SELLER_PORTAL', 'USE_AI', 'USE_KAEN'],
  SUPPLIER: ['SELLER_PORTAL', 'USE_AI', 'USE_KAEN'],
  LOGISTICS: ['LOGISTICS_PORTAL', 'USE_AI'],

  // Organization-Bound Worker Role (fine-grained perms come from OrganizationMembership)
  WORKER: ['WORKER_PORTAL', 'USE_AI']
};

/**
 * Default organization-level permissions granted per worker role type.
 * Organization owners always hold '*' within their own organization ONLY.
 * Workers NEVER hold 'ORG_OWNERSHIP', 'BANK_SETTINGS', or platform admin permissions.
 */
export const WORKER_DEFAULT_PERMISSIONS = {
  BUSINESS_MANAGER: [
    'MANAGE_WORKERS', 'INVITE_WORKERS', 'REVIEW_PARTNERSHIPS', 'APPROVE_PARTNERSHIPS',
    'VIEW_ORDERS', 'MANAGE_ORDERS', 'VIEW_RFQS', 'MANAGE_QUOTATIONS', 'VIEW_INVENTORY',
    'ASSIGN_TASKS', 'APPROVE_LEAVE', 'VIEW_BRANCHES', 'USE_KAEN'
  ],
  VERIFICATION_MANAGER: [
    'REVIEW_PARTNERSHIPS', 'REQUEST_PARTNERSHIP_INFO', 'RECOMMEND_PARTNERSHIP', 'VIEW_DOCUMENTS'
  ],
  PROCUREMENT_MANAGER: [
    'CREATE_RFQ', 'VIEW_RFQS', 'COMPARE_QUOTES', 'CREATE_PO', 'VIEW_ORDERS', 'USE_KAEN', 'VIEW_INVENTORY'
  ],
  SALES_EXECUTIVE: [
    'VIEW_ENQUIRIES', 'VIEW_RFQS', 'MANAGE_QUOTATIONS', 'VIEW_ORDERS', 'USE_CHAT', 'USE_KAEN'
  ],
  CUSTOMER_SUPPORT: [
    'VIEW_ORDERS', 'USE_CHAT', 'MANAGE_DISPUTES', 'MANAGE_RETURNS'
  ],
  INVENTORY_MANAGER: [
    'VIEW_INVENTORY', 'MANAGE_INVENTORY', 'TRANSFER_STOCK', 'VIEW_ORDERS', 'VIEW_BRANCHES'
  ],
  WAREHOUSE_STAFF: [
    'VIEW_INVENTORY', 'RECEIVE_STOCK', 'PICK_PACK_DISPATCH'
  ],
  PACKAGING_STAFF: [
    'VIEW_INVENTORY', 'PICK_PACK_DISPATCH'
  ],
  DISPATCH_STAFF: [
    'VIEW_ORDERS', 'PICK_PACK_DISPATCH', 'CREATE_SHIPMENT'
  ],
  MANUFACTURING_SUPERVISOR: [
    'VIEW_PRODUCTION', 'MANAGE_PRODUCTION', 'VIEW_INVENTORY', 'ASSIGN_TASKS'
  ],
  PRODUCTION_WORKER: [
    'VIEW_PRODUCTION', 'UPDATE_PRODUCTION_STAGE'
  ],
  QUALITY_CONTROL: [
    'VIEW_PRODUCTION', 'RECORD_QC_INSPECTION'
  ],
  ACCOUNTANT: [
    'VIEW_ORDERS', 'VIEW_INVOICES', 'MANAGE_INVOICES', 'VIEW_PAYMENTS'
  ],
  LOGISTICS_COORDINATOR: [
    'VIEW_SHIPMENTS', 'MANAGE_SHIPMENTS', 'MANAGE_FLEET', 'ASSIGN_DRIVERS'
  ],
  DRIVER: [
    'VIEW_ASSIGNED_SHIPMENTS', 'UPDATE_SHIPMENT_STATUS', 'UPLOAD_POD'
  ]
};

export const ALL_VALID_ORG_PERMISSIONS = new Set(
  Object.values(WORKER_DEFAULT_PERMISSIONS).flat()
);

export function isAdminRole(role) {
  return ADMIN_ROLES.has(role);
}

export function hasPlatformPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
}

export function hasOrgPermission(membership, permission) {
  if (!membership || membership.employmentStatus !== 'ACTIVE') return false;
  if (membership.isOwner) return true;
  const custom = Array.isArray(membership.permissions) ? membership.permissions : [];
  const defaults = WORKER_DEFAULT_PERMISSIONS[membership.workerRole] || [];
  return custom.includes(permission) || defaults.includes(permission);
}
