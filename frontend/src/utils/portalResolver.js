/**
 * SAHAYAK B2B — Single Authoritative Frontend Portal Resolver
 * Mirrors backend resolvePortalDestination() in backend/src/config/permissions.js.
 * Strictly separates platform role, persisted business type, and verification status.
 * Business accounts can NEVER resolve to the Admin Portal.
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

export const PENDING_STATUSES = new Set([
  'PENDING_VERIFICATION',
  'INCOMPLETE_PROFILE',
  'NEEDS_INFO',
  'ON_HOLD'
]);

export function isAdminRole(role) {
  return Boolean(role && ADMIN_ROLES.has(String(role).toUpperCase()));
}

export function isPendingStatus(status) {
  return Boolean(status && PENDING_STATUSES.has(String(status).toUpperCase()));
}

/**
 * Resolves the authoritative portal, workspace, and canonical route for an authenticated user.
 * Uses backend-provided user.portalDestination when valid, with deterministic role + org fallback.
 */
export function resolvePortalDestination(user) {
  if (!user || !user.role) {
    return {
      platformRole: null,
      businessType: null,
      portal: null,
      workspace: null,
      route: '/login'
    };
  }

  const role = String(user.role).toUpperCase();
  const status = String(user.status || '').toUpperCase();
  const org = user.organization || null;
  const membership = user.membership || null;

  const platformRole =
    role === 'SUPER_ADMIN'
      ? 'SUPER_ADMIN'
      : ADMIN_ROLES.has(role)
        ? 'ADMIN'
        : role === 'WORKER'
          ? 'WORKER'
          : 'BUSINESS_USER';

  const businessType =
    platformRole === 'BUSINESS_USER'
      ? String(org?.businessType || user.businessProfile?.businessType || user.businessType || role).toUpperCase()
      : null;

  if (status === 'REJECTED' || status === 'SUSPENDED') {
    return {
      platformRole,
      businessType,
      portal: 'RESTRICTED',
      workspace: status,
      route: '/restricted'
    };
  }

  if (PENDING_STATUSES.has(status)) {
    return {
      platformRole,
      businessType,
      portal: 'PENDING',
      workspace: status,
      route: '/pending'
    };
  }

  // Trust backend-computed destination only when it matches non-escalating role class
  const backendDest = user.portalDestination;
  if (backendDest && backendDest.portal && backendDest.route) {
    const backendIsAdmin = backendDest.portal === 'ADMIN';
    const userIsAdmin = platformRole === 'SUPER_ADMIN' || platformRole === 'ADMIN';
    if (backendIsAdmin === userIsAdmin) {
      return backendDest;
    }
  }

  if (platformRole === 'SUPER_ADMIN' || platformRole === 'ADMIN') {
    return {
      platformRole,
      businessType: null,
      portal: 'ADMIN',
      workspace: role,
      route: '/dashboard/admin'
    };
  }

  if (platformRole === 'WORKER') {
    return {
      platformRole,
      businessType: org?.businessType || null,
      portal: 'WORKER',
      workspace: membership?.workerRole || 'WORKER',
      route: '/dashboard/worker'
    };
  }

  const portalType = org?.portalType ? String(org.portalType).toUpperCase() : null;
  if (portalType === 'LOGISTICS' || businessType === 'LOGISTICS') {
    return {
      platformRole,
      businessType: 'LOGISTICS',
      portal: 'LOGISTICS',
      workspace: 'LOGISTICS',
      route: '/dashboard/logistics'
    };
  }

  if (
    portalType === 'SELLER' ||
    ['WHOLESALER', 'MANUFACTURER', 'DISTRIBUTOR', 'SUPPLIER'].includes(businessType)
  ) {
    const workspace =
      businessType === 'MANUFACTURER'
        ? 'MANUFACTURER'
        : businessType === 'DISTRIBUTOR'
          ? 'DISTRIBUTOR'
          : 'SELLER';
    return {
      platformRole,
      businessType,
      portal: 'SELLER',
      workspace,
      route: '/dashboard/seller'
    };
  }

  return {
    platformRole,
    businessType: businessType || 'RETAILER',
    portal: 'BUYER',
    workspace: 'BUYER',
    route: '/dashboard/buyer'
  };
}
