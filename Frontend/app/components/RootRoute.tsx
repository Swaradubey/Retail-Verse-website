import { Navigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { resolvePostLoginPath } from '../utils/staffRoles';
import { Home } from '../pages/Home';

export function RootRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (user) {
    // If already logged in, redirect to their dashboard/home based on role
    return <Navigate to={resolvePostLoginPath(user.role, '/dashboard')} replace />;
  }

  // Not logged in, show public Home page
  return <Home />;
}
