import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { normalizeRole, isVendorRole } from '../utils/staffRoles';

interface RoleProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: readonly string[];
  loginPath?: string;
  redirectTo?: string;
}

export function RoleProtectedRoute({
  children,
  allowedRoles = ['VENDOR', 'vendor'],
  loginPath = '/login',
  redirectTo = '/dashboard',
}: RoleProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading && !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    const params = new URLSearchParams(location.search);
    const email = params.get('email');
    const targetUrl = location.pathname + location.search;
    let to = `${loginPath}?redirect=${encodeURIComponent(targetUrl)}`;
    if (email) {
      to += `&email=${encodeURIComponent(email)}`;
    }
    return <Navigate to={to} state={{ from: location }} replace />;
  }

  const userRole = String(user.role || '').trim();
  const normalizedUser = normalizeRole(userRole);
  const normalizedAllowed = allowedRoles.map((r) => normalizeRole(r));

  const hasAccess =
    allowedRoles.includes(userRole) ||
    allowedRoles.map((r) => r.toUpperCase()).includes(userRole.toUpperCase()) ||
    normalizedAllowed.includes(normalizedUser);

  if (!hasAccess) {
    if (isVendorRole(userRole)) {
      return <Navigate to="/vendor/dashboard" replace />;
    }
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

