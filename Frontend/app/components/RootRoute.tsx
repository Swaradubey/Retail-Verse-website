import { Navigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { resolvePostLoginPath } from '../utils/staffRoles';
import { Home } from '../pages/Home';

export function RootRoute() {
  const { user, isLoading } = useAuth();

  // If user is confirmed logged in, redirect immediately
  if (user) {
    return <Navigate to={resolvePostLoginPath(user.role, '/dashboard')} replace />;
  }

  // Render the Home page immediately — auth is resolved in the background.
  // Once isLoading becomes false and user is set, the Navigate above will fire.
  // This prevents the full-screen spinner from blocking the static homepage.
  return <Home />;
}
