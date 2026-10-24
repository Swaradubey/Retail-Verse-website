import React from 'react';

type DashboardNavbarProps = {
  premiumOverview?: boolean;
};

export function DashboardNavbar({ premiumOverview = false }: DashboardNavbarProps) {
  // Navigation bar options (SidebarTrigger / close icon, Search all, and Notification bell)
  // have been removed per user request so that no vertical space is occupied.
  return null;
}

export default DashboardNavbar;
