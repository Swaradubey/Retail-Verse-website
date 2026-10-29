/**
 * Super Admin "Open …" actions on Users & roles: label, post-open route, and impersonation behavior.
 * Paths must match real router paths in `app/routes.tsx`.
 */
import { normalizeRole } from './staffRoles';

export type RoleOpenPanelConfig = {
  buttonLabel: string;
  /** Where to send the browser after a successful open (with impersonation when applicable). */
  path: string;
  /**
   * If true, Super Admin session is swapped via POST /api/superadmin/impersonate/:id.
   * If false, current session is unchanged (e.g. already Super Admin opening /super-admin).
   */
  useImpersonation: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  client: 'Client',
  cashier: 'Cashier',
  user: 'User',
  customer: 'Customer',
  inventory_manager: 'Inventory Manager',
  seo_manager: 'SEO Manager',
  staff: 'Staff',
  store_manager: 'Store Manager',
  employee: 'Employee',
  counter_manager: 'Counter Manager',
  vendor: 'Vendor',
  VENDOR: 'Vendor',
};

export function roleDisplayName(role: string | undefined): string {
  if (!role) return 'User';
  const normalized = normalizeRole(role);
  return ROLE_LABEL[normalized] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Maps saved account role → open action. Roles not listed fall back to generic staff/user dashboard + impersonation. */
const OPEN_PANEL: Record<string, Omit<RoleOpenPanelConfig, 'useImpersonation'>> = {
  admin: { buttonLabel: 'Open Admin', path: '/dashboard' },
  super_admin: { buttonLabel: 'Open Super Admin', path: '/super-admin' },
  client: { buttonLabel: 'Open Client', path: '/dashboard/inventory' },
  cashier: { buttonLabel: 'Open Cashier', path: '/pos' },
  user: { buttonLabel: 'Open User', path: '/dashboard' },
  customer: { buttonLabel: 'Open Customer', path: '/dashboard' },
  inventory_manager: { buttonLabel: 'Open Inventory Manager', path: '/dashboard/inventory' },
  seo_manager: { buttonLabel: 'Open SEO Manager', path: '/dashboard/seo' },
  staff: { buttonLabel: 'Open Staff', path: '/dashboard' },
  store_manager: { buttonLabel: 'Open Store Manager', path: '/dashboard/inventory' },
  employee: { buttonLabel: 'Open Employee', path: '/dashboard/inventory' },
  counter_manager: { buttonLabel: 'Open Counter Manager', path: '/dashboard/inventory' },
  vendor: { buttonLabel: 'Open Vendor', path: '/vendor/dashboard' },
  VENDOR: { buttonLabel: 'Open Vendor', path: '/vendor/dashboard' },
};

export function getRoleOpenPanelConfig(role: string | undefined): RoleOpenPanelConfig | null {
  if (!role) return null;
  const normalized = normalizeRole(role);
  if (normalized === 'super_admin') {
    const base = OPEN_PANEL.super_admin;
    return { ...base, useImpersonation: false };
  }
  const base = OPEN_PANEL[normalized];
  if (base) {
    return { ...base, useImpersonation: true };
  }
  return {
    buttonLabel: `Open ${roleDisplayName(role)}`,
    path: '/dashboard',
    useImpersonation: true,
  };
}
