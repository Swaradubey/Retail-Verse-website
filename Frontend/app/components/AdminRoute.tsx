import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { isStaffRole } from '../utils/staffRoles';

type AdminRouteProps = {
  children: React.ReactNode;
  /** Staff roles that must not access this route (e.g. inventory_manager for contact tools). */
  blockedRoles?: readonly string[];
};

export function AdminRoute({ children, blockedRoles }: AdminRouteProps) {
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
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isStaffRole(user.role)) {
    return <Navigate to="/" replace />;
  }

  if (blockedRoles?.length && blockedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
