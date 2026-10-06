import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { getFullImageUrl } from '../utils/imageUrl';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  LogOut,
  TrendingUp,
  HelpCircle,
  Headphones,
  Warehouse,
  Heart,
  Activity,
  Mail,
  Truck,
  Shield,
  UserCog,
  UserPlus,
  Building2,
  Receipt,
  Globe,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Crown,
  Settings,
  Mic,
  Store,
} from 'lucide-react';
import { useNavigate, useLocation, Outlet, Link, Navigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarRail,
  SidebarTrigger,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton
} from '../components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../components/ui/collapsible';
import { Button } from '../components/ui/button';
import { DashboardStats } from '../components/DashboardStats';
import { DashboardCharts } from '../components/DashboardCharts';
import { DashboardRecentTickets } from '../components/DashboardRecentTickets';
import { DashboardQuickActions } from '../components/DashboardQuickActions';
import { DashboardContactSummary } from '../components/DashboardContactSummary';
import { DashboardNavbar } from '../components/DashboardNavbar';
import { Footer } from '../components/Footer';
import { DashboardSkeleton } from '../components/DashboardSkeleton';
import { canAccessInventoryEditor } from '../utils/inventoryPermissions';
import {
  hasFullAdminPrivileges,
  isCashierRole,
  isClientRole,
  isCustomerAccountRole,
  isCounterManagerRole,
  isInventoryManagerRole,
  isRestrictedInventoryDashboardRole,
  isStaffRole,
  isStoreManagerRole,
  isSuperAdminRole,
  normalizeRole,
} from '../utils/staffRoles';
import { fetchAdminAnalytics, fetchUserAnalytics, fetchSuperAdminOverview, type AdminAnalyticsData, type UserAnalyticsData } from '../api/analytics';
import { fetchUserDashboardOverview, type UserDashboardOverviewData } from '../api/orders';
import { ImpersonationBanner } from '../components/ImpersonationBanner';
import { toast } from 'sonner';

const sidebarItems = [
  { title: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { title: "Products", icon: Package, href: "/dashboard/products", hideForSuperAdmin: true },
  { title: "Inventory", icon: Warehouse, href: "/dashboard/inventory", staffOnly: true, hideForSuperAdmin: true, hideForUser: true },
  { title: "POS", icon: ShoppingCart, href: "/pos", hideForSuperAdmin: true, hideForUser: true },
  { title: "Wishlist", icon: Heart, href: "/dashboard/wishlist", hideForSuperAdmin: true },
  { title: "Track Order", icon: Truck, href: "/track-order", hideForInventoryManager: true, hideForSuperAdmin: true },
  { title: "Subscription / Upgrade Plan", icon: Crown, href: "/dashboard/subscription", hideForSuperAdmin: true },
  { title: "Wishlist Activity", icon: Activity, href: "/dashboard/wishlist-activity", adminOnly: true, hideForSuperAdmin: true },
  { title: "Super Admin", icon: Shield, href: "/super-admin", superAdminOnly: true, hideForSuperAdmin: true },
  { title: "Orders", icon: ShoppingCart, href: "/dashboard/orders", hideForUser: false, hideForSuperAdmin: true },
  { title: "Invoice", icon: Receipt, href: "/dashboard/invoices", superAdminOnly: true },
  {
    title: "Customers",
    icon: Users,
    href: "/dashboard/customers",
    adminOnly: true,
    subItems: [
      { title: "All Customers", href: "/dashboard/customers", icon: Users },
      { title: "Contact Form", href: "/dashboard/customers/contact-form", icon: Mail }
    ]
  },
  { title: "Users & roles", icon: UserCog, href: "/dashboard/users", adminOnly: true },
  { title: "Clients", icon: Building2, href: "/super-admin/clients", superAdminOnly: true },
  { title: "Add Custom Domain", icon: Globe, href: "/super-admin/custom-domain", adminOnly: true },
  { title: "Marketplace Integrations", icon: Store, href: "/dashboard/marketplaces", adminOnly: true },
  { title: "Employee", icon: UserPlus, href: "/dashboard/add-employee", staffOnly: true, hideForSuperAdmin: true, hideForUser: true },
  { title: "Support", icon: Headphones, href: "/dashboard/support" },
  { title: "Help Center", icon: HelpCircle, href: "/dashboard/help-center", helpCenter: true },
  { title: "POS", icon: ShoppingCart, href: "/pos", counterManagerOnly: true },
  { title: "Settings", icon: Settings, href: "/super-admin/settings", superAdminOnly: true },
  { title: "Settings", icon: Settings, href: "/dashboard/settings", adminOnly: true, hideForSuperAdmin: true },
  // ── AI Voice Order Capture ─────────────────────────────────────────────────
  { title: "AI Voice Orders", icon: Mic, href: "/dashboard/ai-voice-orders", hideForSuperAdmin: true },
];

/** Shared pill layout for every dashboard sidebar link strictly in 4-color palette */
function dashboardSidebarNavButtonClass(isActive: boolean): string {
  const base =
    'relative group flex w-full h-auto min-h-[44px] items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all duration-200 ease-out outline-hidden focus-visible:ring-2 focus-visible:ring-[#2563EB] overflow-hidden [&>svg]:!size-5 [&>svg]:shrink-0 group-data-[collapsible=icon]:!size-12 group-data-[collapsible=icon]:!min-h-12 group-data-[collapsible=icon]:!p-3 group-data-[collapsible=icon]:gap-0';

  if (isActive) {
    return `${base} bg-[#2563EB] text-[#F8FAFC] border border-[#2563EB] font-bold shadow-md`;
  }

  return `${base} bg-[#0B1F3A] text-[#F8FAFC]/80 border border-transparent hover:bg-[#2563EB]/20 hover:text-[#F8FAFC] hover:border-[#2563EB]/40`;
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  /** Dynamic brand name: from BrandingContext (pre-login), then user businessName, then default */
  const { brandName: dsBrandName, logo: brandLogo } = useBranding();
  const dsFinalBrandName = isSuperAdminRole(user?.role)
    ? 'Daizy Homes'
    : user?.role === 'client' && user?.businessName
      ? user.businessName
      : dsBrandName;

  const restrictedInventoryDashboardRole = isRestrictedInventoryDashboardRole(user?.role);
  const staff = isStaffRole(user?.role);
  const isOverviewPath = location.pathname === '/dashboard';

  const [overviewData, setOverviewData] = useState<AdminAnalyticsData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [userOverviewData, setUserOverviewData] = useState<UserDashboardOverviewData | null>(null);
  const [userOverviewError, setUserOverviewError] = useState<string | null>(null);
  const [userAnalyticsData, setUserAnalyticsData] = useState<UserAnalyticsData | null>(null);
  const [userAnalyticsError, setUserAnalyticsError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const loadOverview = useCallback(
    async (opts?: { silent?: boolean }): Promise<{ ok: boolean; error?: string }> => {
      if (!staff || !isOverviewPath) {
        setOverviewLoading(false);
        return { ok: true };
      }
      if (!opts?.silent) {
        setOverviewLoading(true);
      }
      setOverviewError(null);
      try {
        let d: AdminAnalyticsData;
        if (isSuperAdminRole(user?.role)) {
          console.log('[Dashboard] Fetching /api/superadmin/overview');
          d = await fetchSuperAdminOverview();
          console.log('[Dashboard] SuperAdmin Overview Data:', d);
        } else {
          console.log('[Dashboard] Fetching /api/admin/analytics');
          d = await fetchAdminAnalytics();
        }
        setOverviewData(d);
        console.log("Dashboard overview API response:", d);
        return { ok: true };
      } catch (e: unknown) {
        console.error('[Dashboard] Error in loadOverview:', e);
        const msg = e instanceof Error ? e.message : 'Failed to load dashboard data';
        setOverviewError(msg);
        if (!opts?.silent) {
          setOverviewData(null);
        }
        return { ok: false, error: msg };
      } finally {
        if (!opts?.silent) {
          setOverviewLoading(false);
        }
      }
    },
    [staff, isOverviewPath, user?.role]
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const handleOrderDeleted = () => {
      console.log('[Dashboard] Order deleted event received, refetching overview stats...');
      void loadOverview({ silent: true });
    };
    window.addEventListener('order-deleted', handleOrderDeleted);
    return () => {
      window.removeEventListener('order-deleted', handleOrderDeleted);
    };
  }, [loadOverview]);

  useEffect(() => {
    if (!isCustomerAccountRole(user?.role) || location.pathname !== '/dashboard') {
      setUserOverviewData(null);
      setUserOverviewError(null);
      setUserAnalyticsData(null);
      setUserAnalyticsError(null);
      return;
    }
    let cancelled = false;
    setUserOverviewError(null);
    setUserAnalyticsError(null);
    (async () => {
      try {
        const [overview, analytics] = await Promise.all([
          fetchUserDashboardOverview(),
          fetchUserAnalytics(),
        ]);
        if (!cancelled) {
          setUserOverviewData(overview);
          setUserAnalyticsData(analytics);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const errMsg = e instanceof Error ? e.message : 'Failed to load overview';
          setUserOverviewError(errMsg);
          setUserAnalyticsError(errMsg);
          setUserOverviewData(null);
          setUserAnalyticsData(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.role, location.pathname]);

  useEffect(() => {
    if (isClientRole(user?.role) && location.pathname === '/dashboard') {
      // No redirect
    }
  }, [user?.role, location.pathname, navigate]);

  const handleDashboardSync = useCallback(async () => {
    setSyncing(true);
    try {
      if (isCustomerAccountRole(user?.role) && location.pathname === '/dashboard') {
        try {
          const d = await fetchUserDashboardOverview();
          setUserOverviewData(d);
          setUserOverviewError(null);
          toast.success('Dashboard synced');
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Could not refresh dashboard';
          setUserOverviewError(msg);
          toast.error(msg);
        }
        return;
      }
      const res = await loadOverview({ silent: true });
      if (res.ok) {
        toast.success('Dashboard synced');
      } else {
        toast.error(res.error || 'Could not refresh dashboard');
      }
    } finally {
      setSyncing(false);
    }
  }, [loadOverview, user?.role, location.pathname]);

  const mainSidebarItems = sidebarItems.filter((item) => {
    if (isCustomerAccountRole(user?.role) && 'hideForUser' in item && item.hideForUser) {
      return false;
    }
    if (isCashierRole(user?.role)) {
      return (
        item.href === '/dashboard/products' ||
        item.href === '/pos'
      );
    }
    if (isCounterManagerRole(user?.role)) {
      return (
        item.href === '/dashboard/products' ||
        item.href === '/dashboard/inventory' ||
        (item.title === 'POS' && item.counterManagerOnly)
      );
    }
    if ('counterManagerOnly' in item && item.counterManagerOnly) {
      return false;
    }
    if (restrictedInventoryDashboardRole) {
      return (
        item.href === '/dashboard/products' ||
        item.href === '/dashboard/inventory' ||
        (isStoreManagerRole(user?.role) && item.href === '/pos')
      );
    }
    if (isClientRole(user?.role)) {
      return (
        item.href === '/dashboard' ||
        item.href === '/dashboard/products' ||
        item.href === '/dashboard/inventory' ||
        item.href === '/dashboard/ai-voice-orders' ||
        item.href === '/dashboard/orders' ||
        item.href === '/dashboard/invoices' ||
        item.href === '/dashboard/customers' ||
        item.href === '/dashboard/users' ||
        item.href === '/super-admin/custom-domain' ||
        item.href === '/dashboard/add-employee' ||
        item.href === '/dashboard/support' ||
        item.href === '/dashboard/settings'
      );
    }
    if (normalizeRole(user?.role) === 'admin') {
      if (
        item.title === 'Orders' ||
        item.title === 'Track Order' ||
        item.title === 'Customers' ||
        item.title === 'Wishlist' ||
        item.title === 'Wishlist Activity' ||
        item.title === 'SEO'
      ) {
        return false;
      }
    }
    if ('hideForSuperAdmin' in item && item.hideForSuperAdmin && isSuperAdminRole(user?.role)) {
      return false;
    }
    if ('superAdminOnly' in item && item.superAdminOnly && !isSuperAdminRole(user?.role)) {
      return false;
    }
    if ('staffOnly' in item && item.staffOnly && !isStaffRole(user?.role)) {
      return false;
    }
    if ('adminOnly' in item && item.adminOnly && !hasFullAdminPrivileges(user?.role)) {
      return false;
    }
    if ('userOnly' in item && item.userOnly && !isCustomerAccountRole(user?.role)) {
      return false;
    }
    if (item.href === '/dashboard/inventory') {
      return canAccessInventoryEditor(user?.role);
    }
    if ('hideForInventoryManager' in item && item.hideForInventoryManager && isInventoryManagerRole(user?.role)) {
      return false;
    }
    if ('helpCenter' in item && item.helpCenter) {
      if (isSuperAdminRole(user?.role) || normalizeRole(user?.role) === 'admin') return false;
      return isCustomerAccountRole(user?.role) || isStaffRole(user?.role);
    }
    return true;
  });
  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isOverview = location.pathname === '/dashboard';
  const isCustomerOverview = isOverview && isCustomerAccountRole(user?.role);
  const userOverviewPending =
    isCustomerOverview && userOverviewData === null && userOverviewError === null;
  const showOverviewSkeleton =
    isOverview &&
    ((staff && (overviewLoading || (!overviewData && !overviewError))) || userOverviewPending);

  const isAdminRole = normalizeRole(user?.role) === 'admin';

  const canAccessCurrentDashboardRoute =
    location.pathname === '/dashboard/products' ||
    location.pathname.startsWith('/dashboard/products/') ||
    location.pathname === '/dashboard/inventory' ||
    location.pathname.startsWith('/dashboard/inventory/') ||
    ((isStoreManagerRole(user?.role) || isCounterManagerRole(user?.role)) && (location.pathname === '/pos' || location.pathname.startsWith('/pos/')));

  const shouldRedirectRestrictedRole =
    (restrictedInventoryDashboardRole || isCounterManagerRole(user?.role)) && !canAccessCurrentDashboardRoute;

  if (normalizeRole(user?.role) === 'seo_manager' && (location.pathname === '/dashboard/seo' || location.pathname.startsWith('/dashboard/seo/'))) {
    return <Navigate to="/dashboard/products" replace />;
  }

  if (shouldRedirectRestrictedRole) {
    return <Navigate to="/dashboard/products" replace />;
  }

  const cashierAllowedRoute =
    location.pathname === '/dashboard/products' ||
    location.pathname.startsWith('/dashboard/products/') ||
    location.pathname === '/pos' ||
    location.pathname.startsWith('/pos/');
  if (isCashierRole(user?.role) && !cashierAllowedRoute) {
    return <Navigate to="/dashboard/products" replace />;
  }

  if (isAdminRole && (location.pathname === '/dashboard/seo' || location.pathname.startsWith('/dashboard/seo/'))) {
    return <Navigate to="/dashboard" replace />;
  }

  // Trial Expiration Guard
  if (user?.isTrialExpired && !isSuperAdminRole(user?.role)) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B1F3A]/80 backdrop-blur-md p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-[#F8FAFC] rounded-3xl shadow-2xl overflow-hidden border border-[#0B1F3A]"
        >
          <div className="bg-[#0B1F3A] p-8 flex flex-col items-center text-center text-[#F8FAFC]">
            <div className="w-20 h-20 rounded-2xl bg-[#FF6B00] flex items-center justify-center text-[#F8FAFC] shadow-xl mb-6">
              <AlertCircle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-[#F8FAFC] tracking-tight mb-2">Trial Expired</h2>
            <p className="text-[#F8FAFC]/90 font-medium leading-relaxed">
              Your 14-day trial has expired. Access to your dashboard and POS has been restricted.
            </p>
          </div>
          <div className="p-8 space-y-6 bg-[#F8FAFC]">
            <div className="bg-[#F8FAFC] rounded-2xl p-4 border border-[#0B1F3A]">
              <p className="text-sm text-[#0B1F3A] text-center font-medium">
                To continue using <span className="text-[#2563EB] font-bold">{dsFinalBrandName}</span>, please contact the Super Admin to extend your trial or upgrade your plan.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => window.location.reload()}
                className="w-full h-12 bg-[#FF6B00] text-[#F8FAFC] hover:bg-[#2563EB] rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Check Status Again
              </Button>
              <Button
                variant="outline"
                onClick={handleLogout}
                className="w-full h-12 border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#2563EB] hover:text-[#F8FAFC] rounded-xl font-bold transition-colors"
              >
                Sign Out
              </Button>
            </div>
          </div>
          <div className="bg-[#0B1F3A] px-8 py-4 text-center border-t border-[#0B1F3A]">
            <p className="text-[10px] text-[#F8FAFC]/70 uppercase tracking-widest font-bold">Powered by Retail Verse Platform</p>
          </div>
        </motion.div>
      </div>
    );
  }

  const { themeKey } = useTheme();

  return (
    <SidebarProvider>
      <div
        className={`client-dashboard theme-${themeKey} flex flex-col min-h-screen w-full overflow-x-hidden bg-[#F8FAFC] text-[#0B1F3A]`}
      >
        <ImpersonationBanner />
        <div className="flex min-h-0 flex-1 w-full">
          {/* Sidebar */}
          <Sidebar
            collapsible="icon"
            className="border-r border-[#2563EB]/30 bg-[#0B1F3A] text-[#F8FAFC]"
            style={
              user?.impersonation?.active
                ? { top: '48px', height: 'calc(100svh - 48px)' }
                : undefined
            }
          >
            <SidebarHeader className="group-data-[collapsible=icon]:h-14 h-16 flex items-center px-6 border-b border-[#2563EB]/30 bg-[#0B1F3A] text-[#F8FAFC]">
              {/* Expanded header */}
              <div className="flex items-center gap-3 w-full group-data-[collapsible=icon]:hidden">
                <Link
                  to="/"
                  aria-label="Go to homepage"
                  className="flex items-center gap-3 cursor-pointer min-w-0 flex-1 group/logo"
                >
                  {brandLogo ? (
                    <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center bg-[#0B1F3A] border border-[#2563EB] shrink-0">
                      <img
                        src={getFullImageUrl(brandLogo)}
                        alt={`${dsFinalBrandName} logo`}
                        className="w-full h-full object-contain p-0.5"
                        onError={(e) => {
                          (e.target as HTMLImageElement).onerror = null;
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-xl bg-[#2563EB] flex items-center justify-center text-[#F8FAFC] shrink-0 font-bold text-lg">
                      <span>R</span>
                    </div>
                  )}
                  <div className="flex flex-col min-w-0 flex-1 leading-tight">
                    <span className="font-bold text-xl tracking-tight text-[#F8FAFC] truncate">{dsFinalBrandName}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[#2563EB]">PORTAL</span>
                  </div>
                </Link>
                <SidebarTrigger className="size-7 shrink-0 text-[#F8FAFC] hover:text-[#FF6B00]" />
              </div>
              {/* Collapsed header - centered toggle */}
              <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-full h-full">
                <SidebarTrigger className="size-7 text-[#F8FAFC] hover:text-[#FF6B00]" />
              </div>
            </SidebarHeader>

            <SidebarContent className="px-2 pt-4 group-data-[collapsible=icon]:pt-8 bg-[#0B1F3A] text-[#F8FAFC]">
              <SidebarGroup>
                <SidebarGroupLabel className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#F8FAFC]/60 group-data-[collapsible=icon]:hidden">
                  Main Menu
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-2">
                    {mainSidebarItems.map((item) => {
                      const href = item.href;
                      const isActive = href === '/dashboard' ? location.pathname === '/dashboard' : (href ? location.pathname.startsWith(href) : item.title === 'Overview' && location.pathname === '/dashboard');

                      if ('subItems' in item && Array.isArray(item.subItems) && item.subItems.length > 0) {
                        const isSubActive = item.subItems.some(sub => location.pathname === sub.href || location.pathname.startsWith(sub.href + '/'));
                        return (
                          <Collapsible key={item.title} defaultOpen={isActive || isSubActive} className="group/collapsible">
                            <SidebarMenuItem>
                              <CollapsibleTrigger asChild>
                                <SidebarMenuButton
                                  tooltip={item.title}
                                  onClick={() => {
                                    navigate(href || '#');
                                  }}
                                  className={dashboardSidebarNavButtonClass(isActive || isSubActive)}
                                >
                                  {item.icon && <item.icon className="w-5 h-5 shrink-0 text-[#F8FAFC]" />}
                                  <span className="group-data-[collapsible=icon]:hidden flex-1 min-w-0 text-left text-[16px] font-semibold tracking-wide leading-snug">
                                    {item.title}
                                  </span>
                                  <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden w-5 h-5 shrink-0 text-[#F8FAFC]" />
                                </SidebarMenuButton>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <SidebarMenuSub>
                                  {item.subItems.map(subItem => {
                                    const subIsActive = subItem.href === item.href
                                      ? location.pathname === subItem.href
                                      : location.pathname.startsWith(subItem.href);
                                    return (
                                      <SidebarMenuSubItem key={subItem.title}>
                                        <SidebarMenuSubButton asChild isActive={subIsActive} className={`h-10 text-[15px] font-medium ${subIsActive ? 'bg-[#2563EB] text-[#F8FAFC]' : 'text-[#F8FAFC]/80 hover:bg-[#2563EB]/20 hover:text-[#F8FAFC]'}`}>
                                          <Link to={subItem.href}>
                                            {subItem.icon && <subItem.icon className="w-4 h-4 mr-2" />}
                                            <span>{subItem.title}</span>
                                          </Link>
                                        </SidebarMenuSubButton>
                                      </SidebarMenuSubItem>
                                    );
                                  })}
                                </SidebarMenuSub>
                              </CollapsibleContent>
                            </SidebarMenuItem>
                          </Collapsible>
                        );
                      }

                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            tooltip={
                              item.title === 'Orders' && (isSuperAdminRole(user?.role) || isClientRole(user?.role))
                                ? 'Sale'
                                : item.title === 'Invoice'
                                  ? 'Quotes and Invoice'
                                  : item.title
                            }
                            className={dashboardSidebarNavButtonClass(isActive)}
                          >
                            <Link to={href || '#'} state={href === '/pos' ? { fromDashboard: location.pathname } : undefined}>
                              {item.icon && <item.icon className="w-5 h-5 shrink-0" />}
                              <span className="group-data-[collapsible=icon]:hidden flex-1 min-w-0 text-left text-[16px] font-semibold tracking-wide leading-snug">
                                {item.title === 'Orders' && (isSuperAdminRole(user?.role) || isClientRole(user?.role))
                                  ? 'Sale'
                                  : item.title === 'Invoice'
                                    ? 'Quotes and Invoice'
                                    : item.title}
                              </span>

                              {'badge' in item &&
                                item.badge != null &&
                                item.badge !== '' &&
                                (typeof item.badge === 'string' || typeof item.badge === 'number') && (
                                  <span
                                    className="ml-auto shrink-0 w-5 h-5 rounded-full bg-[#FF6B00] text-[10px] text-[#F8FAFC] flex items-center justify-center font-bold group-data-[collapsible=icon]:hidden shadow-sm"
                                  >
                                    {item.badge}
                                  </span>
                                )}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="p-4 border-t border-[#2563EB]/30 bg-[#0B1F3A]">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[#FF6B00] hover:bg-[#FF6B00]/10 transition-all duration-200 font-medium cursor-pointer"
              >
                <LogOut className="w-5 h-5" />
                <span className="group-data-[collapsible=icon]:hidden">Sign Out</span>
              </button>
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>

          {/* Main Content Area */}
          <SidebarInset className="flex flex-col flex-1 overflow-hidden bg-[#F8FAFC] text-[#0B1F3A]">
            <DashboardNavbar premiumOverview={isOverview} />

            <main
              className={
                isOverview
                  ? 'flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-7 lg:p-10 custom-scrollbar dashboard-overview-fade bg-[#F8FAFC] text-[#0B1F3A]'
                  : location.pathname.startsWith('/dashboard/products')
                    ? 'flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-[#F8FAFC] text-[#0B1F3A]'
                    : 'flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 custom-scrollbar bg-[#F8FAFC] text-[#0B1F3A]'
              }
              style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
            >
              <div className="w-full max-w-[1600px] mx-auto space-y-8 sm:space-y-10 min-w-0">
                {/* Welcome Section */}
                {location.pathname !== '/dashboard/products' && !location.pathname.startsWith('/dashboard/marketplaces') && !location.pathname.startsWith('/admin/marketplaces') && (
                  <motion.div
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-5"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-[#2563EB] mb-3">
                        <TrendingUp className="w-4 h-4 shrink-0 text-[#2563EB]" />
                        <span className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-[#2563EB]">
                          {location.pathname === '/dashboard' ? 'Performance Live' :
                            location.pathname === '/dashboard/subscription' ? 'Subscription' :
                            location.pathname.split('/').pop()?.replace('-', ' ')}
                        </span>
                      </div>
                      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0B1F3A] capitalize leading-tight">
                        {location.pathname === '/dashboard' ? 'Dashboard Overview' :
                          location.pathname === '/dashboard/subscription' ? 'Subscription & Upgrade Plan' :
                          location.pathname.split('/').pop()?.replace('-', ' ')}
                      </h1>
                      <p className="text-[#0B1F3A]/80 mt-2 text-base max-w-xl leading-relaxed">
                        {location.pathname === '/dashboard'
                          ? <>Welcome back, <span className="text-[#0B1F3A] font-semibold">{user?.name || 'Admin'}</span>. Here&apos;s what&apos;s happening today.</>
                          : location.pathname === '/dashboard/subscription'
                            ? 'Manage your subscription plan and upgrade to unlock premium features.'
                            : `Manage your ${location.pathname.split('/').pop()?.replace('-', ' ')} and view detailed insights.`}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        {[1, 2, 3, 4].map(i => (
                          <div
                            key={i}
                            className="w-9 h-9 rounded-full border-2 border-[#0B1F3A] bg-[#F8FAFC] overflow-hidden shadow-md"
                          >
                            <img src={`https://i.pravatar.cc/150?u=${i + 10}`} alt="user" className="w-full h-full object-cover" />
                          </div>
                        ))}
                        <div className="w-9 h-9 rounded-full border-2 border-[#0B1F3A] bg-[#2563EB] text-[#F8FAFC] flex items-center justify-center text-[10px] font-bold shadow-md">
                          +12
                        </div>
                      </div>
                      <span className="text-xs text-[#2563EB] font-semibold underline-offset-4 hover:underline hover:text-[#FF6B00] cursor-pointer transition-colors duration-200">
                        Live Customers
                      </span>
                    </div>
                  </motion.div>
                )}

                <AnimatePresence mode="wait">
                  {showOverviewSkeleton ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <DashboardSkeleton />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="content"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                      {location.pathname === '/dashboard' ? (
                        <motion.div
                          className="space-y-8 sm:space-y-10"
                          initial="hidden"
                          animate="show"
                          variants={{
                            hidden: { opacity: 0 },
                            show: {
                              opacity: 1,
                              transition: { staggerChildren: 0.08, delayChildren: 0.05 },
                            },
                          }}
                        >
                          <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } }}>
                            <DashboardStats
                              analytics={overviewData}
                              staffView={staff}
                              error={overviewError}
                              superAdminOverview={isSuperAdminRole(user?.role) || isClientRole(user?.role)}
                              userOverview={
                                isCustomerOverview
                                  ? {
                                    metrics: userOverviewData,
                                    error: userOverviewError,
                                    pending: userOverviewPending,
                                  }
                                  : undefined
                              }
                            />
                          </motion.div>
                          {!isCustomerOverview && (
                            <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } }}>
                              <DashboardCharts
                                analytics={overviewData}
                                staffView={staff}
                                revenueInInr={isSuperAdminRole(user?.role) || isClientRole(user?.role)}
                              />
                            </motion.div>
                          )}
                          {(isSuperAdminRole(user?.role) || isClientRole(user?.role)) && (
                            <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } }}>
                              <DashboardContactSummary />
                            </motion.div>
                          )}
                          <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } }}>
                            <DashboardQuickActions onSync={handleDashboardSync} syncing={syncing} />
                          </motion.div>
                          {(isSuperAdminRole(user?.role) || isClientRole(user?.role)) && (
                            <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } }}>
                              <DashboardRecentTickets />
                            </motion.div>
                          )}
                        </motion.div>
                      ) : (
                        <Outlet />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <Footer variant="platform" />
              </div>
            </main>
          </SidebarInset>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0B1F3A;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #2563EB;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #FF6B00;
        }
        @keyframes dashboard-overview-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .dashboard-overview-fade {
          animation: dashboard-overview-fade-in 0.5s ease-out both;
        }
      `}} />
    </SidebarProvider>
  );
}
