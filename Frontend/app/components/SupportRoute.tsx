import React from 'react';
import { useAuth } from '../context/AuthContext';
import { DashboardSupport } from '../pages/dashboard/DashboardSupport';
import { UserDashboardSupport } from '../pages/dashboard/UserDashboardSupport';

export function SupportRoute() {
  const { user } = useAuth();
  
  // Decide which support page to show based on role
  const isSuperAdminOrClient = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'client';
  
  if (isSuperAdminOrClient) {
    return <DashboardSupport />;
  }
  
  return <UserDashboardSupport />;
}
