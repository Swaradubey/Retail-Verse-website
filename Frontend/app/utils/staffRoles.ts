/** Matches backend: who may use dashboard and staff tools (not public `user` / `customer`). POS is allowed for any logged-in user via ProtectedRoute. */
export const STAFF_ROLES = [
  'super_admin',
  'admin',
  'staff',
  'inventory_manager',
  'cashier',
  'seo_manager',
  'client',
  'store_manager',
  'manager',
  'employee',
  'counter_manager',
  'viewer',
  'user',
] as const;

/**
 * Normalizes role values from JWT/DB/UI labels into canonical snake_case.
 * Keeps compatibility with legacy values like "Store Manager".
 */
export function normalizeRole(role: string | undefined): string {
  if (!role) return '';
  const canonicalWords = String(role)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\brole\b/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!canonicalWords) return '';
  
  if (canonicalWords === 'superadmin' || canonicalWords === 'super admin') {
    return 'super_admin';
  }
  
  return canonicalWords.replace(/\s+/g, '_');
}

export function isClientRole(role: string | undefined): boolean {
  const n = normalizeRole(role);
  return n === 'client' || n === 'client_admin';
}

/** Storefront shopper accounts (User dashboard overview, not staff). */
export function isCustomerAccountRole(role: string | undefined): boolean {
  const normalized = normalizeRole(role);
  return normalized === 'user' || normalized === 'customer';
}

export function isStaffRole(role: string | undefined): boolean {
  const normalized = normalizeRole(role);
  if (!normalized) return false;
  // Non-staff roles are explicitly 'user' and 'customer'.
  // Any other role (including custom ones) assigned by an admin is treated as staff.
  if (normalized === 'user' || normalized === 'customer') return false;
  return true;
}

export function isSuperAdminRole(role: string | undefined): boolean {
  return normalizeRole(role) === 'super_admin';
}

export function isInventoryManagerRole(role: string | undefined): boolean {
  return normalizeRole(role) === 'inventory_manager';
}

export function isCounterManagerRole(role: string | undefined): boolean {
  return normalizeRole(role) === 'counter_manager';
}

export function isCashierRole(role: string | undefined): boolean {
  return normalizeRole(role) === 'cashier';
}

export function isStoreManagerRole(role: string | undefined): boolean {
  return normalizeRole(role) === 'store_manager';
}

export function isRestrictedInventoryDashboardRole(role: string | undefined): boolean {
  const normalized = normalizeRole(role);
  return (
    normalized === 'store_manager' ||
    normalized === 'inventory_manager' ||
    normalized === 'seo_manager' ||
    normalized === 'employee' ||
    normalized === 'staff' ||
    normalized === 'counter_manager'
  );
}

export function hasOperationalAdminAccess(role: string | undefined): boolean {
  const normalized = normalizeRole(role);
  return normalized === 'admin' || normalized === 'super_admin' || normalized === 'client';
}

/** Full admin dashboard privileges (admin + super admin + client + client_admin). */
export function hasFullAdminPrivileges(role: string | undefined): boolean {
  const normalized = normalizeRole(role);
  return normalized === 'admin' || normalized === 'super_admin' || normalized === 'client' || normalized === 'client_admin';
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  store_manager: 'Store Manager',
  client: 'Client',
  seo_manager: 'SEO Manager',
  inventory_manager: 'Inventory Manager',
  counter_manager: 'Counter Manager',
  manager: 'Manager',
  viewer: 'Viewer',
  cashier: 'Cashier',
  staff: 'Staff',
  employee: 'Employee',
  customer: 'Customer',
  user: 'User',
};

/** Compact badge label for header/nav (null = no badge). */
export function accountRoleBadgeText(role: string | undefined): string | null {
  if (!role) return null;
  const normalized = normalizeRole(role);
  return ROLE_LABEL[normalized] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Subline under the user name in dashboard chrome. */
export function accountRoleSubtitle(role: string | undefined): string {
  if (!role) return 'Logged in as User';
  const label = accountRoleBadgeText(role) || 'User';
  return `Logged in as ${label}`;
}

function isAllowedUserDashboardPath(path: string): boolean {
  return (
    path === '/dashboard' ||
    path.startsWith('/dashboard/products') ||
    path.startsWith('/dashboard/wishlist') ||
    path.startsWith('/dashboard/orders')
  );
}

/** Where to send the user after a successful login. */
export function resolvePostLoginPath(role: string | undefined, fromPath: string): string {
  const normalized = normalizeRole(role);
  if (isRestrictedInventoryDashboardRole(normalized)) {
    const blocked = fromPath.startsWith('/login') || fromPath.startsWith('/register');
    
    // Counter Manager should prefer POS
    if (normalized === 'counter_manager') {
      if (!blocked && (fromPath.startsWith('/pos') || fromPath.startsWith('/dashboard/inventory') || fromPath.startsWith('/dashboard/products'))) {
        return fromPath;
      }
      return '/pos';
    }

    // SEO Manager: only Products and Inventory are allowed; default to /dashboard/products
    if (normalized === 'seo_manager') {
      if (!blocked && (fromPath.startsWith('/dashboard/inventory') || fromPath.startsWith('/dashboard/products'))) {
        return fromPath;
      }
      return '/dashboard/products';
    }

    if (!blocked && (fromPath.startsWith('/dashboard/inventory') || fromPath.startsWith('/dashboard/products'))) {
      return fromPath;
    }
    return '/dashboard/inventory';
  }
  if (normalized === 'super_admin') {
    const blocked =
      fromPath.startsWith('/login') ||
      fromPath.startsWith('/register') ||
      fromPath.startsWith('/super-admin/login');
    if (!blocked && fromPath.startsWith('/super-admin')) {
      return fromPath;
    }
    if (!blocked && (fromPath.startsWith('/dashboard') || fromPath === '/pos')) {
      return fromPath;
    }
    return '/dashboard';
  }
  if (isStaffRole(normalized)) {
    const blocked = fromPath.startsWith('/login') || fromPath.startsWith('/register');
    if (!blocked && (fromPath.startsWith('/dashboard') || fromPath === '/pos')) {
      return fromPath;
    }
    return '/dashboard';
  }
  if (fromPath?.startsWith('/pos')) {
    return '/pos';
  }
  if (isAllowedUserDashboardPath(fromPath)) {
    return fromPath;
  }
  if (
    fromPath &&
    !fromPath.startsWith('/login') &&
    !fromPath.startsWith('/register') &&
    !fromPath.startsWith('/dashboard')
  ) {
    return fromPath;
  }
  if (normalized === 'user') {
    return '/dashboard';
  }
  return '/';
}
