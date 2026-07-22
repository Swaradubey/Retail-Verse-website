import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({
  children,
  loginPath = '/login',
}: {
  children: React.ReactNode;
  /** Where unauthenticated users are sent (default: storefront login). */
  loginPath?: string;
}) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    const params = new URLSearchParams(location.search);
    const email = params.get('email');
    const redirectTo = location.pathname + location.search;
    let to = `${loginPath}?redirect=${encodeURIComponent(redirectTo)}`;
    if (email) {
      to += `&email=${encodeURIComponent(email)}`;
    }
    return <Navigate to={to} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
