import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Settings,
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
  CreditCard,
  Receipt,
  Globe,
  AlertCircle,
  RefreshCw,
  Clock,
  ChevronRight,
  Search,
  Crown,
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
  { title: "Subscription / Upgrade Plan", icon: Crown, href: "/dashboard/subscription" },
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
  { title: "Employee", icon: UserPlus, href: "/dashboard/add-employee", staffOnly: true, hideForSuperAdmin: true, hideForUser: true },
  { title: "Support", icon: Headphones, href: "/dashboard/support" },
  { title: "Help Center", icon: HelpCircle, href: "/dashboard/help-center", helpCenter: true },
  { title: "POS", icon: ShoppingCart, href: "/pos", counterManagerOnly: true },


];

const secondaryItems = [
  { title: "Settings", icon: Settings, href: "/dashboard/settings", hideForSuperAdmin: true },
  { title: "Settings", icon: Settings, href: "/super-admin/settings", superAdminOnly: true },
];

/** Shared pill layout for every dashboard sidebar link (matches Overview row: radius, padding, min-height, icon gap). */
function dashboardSidebarNavButtonClass(isActive: boolean, pageIsOverview: boolean): string {
  const base =
    'relative group flex w-full h-auto min-h-[44px] items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all duration-300 ease-out outline-hidden ring-sidebar-ring focus-visible:ring-2 overflow-hidden [&>svg]:!size-5 [&>svg]:shrink-0 [&>svg]:transition-transform [&>svg]:duration-300 [&>svg]:ease-out group-hover:[&>svg]:scale-105 group-data-[collapsible=icon]:!size-12 group-data-[collapsible=icon]:!min-h-12 group-data-[collapsible=icon]:!p-3 group-data-[collapsible=icon]:gap-0';

  if (isActive) {
    return `${base} border border-amber-200/70 bg-gradient-to-r from-amber-100/90 via-amber-50/80 to-transparent text-amber-900 shadow-sm shadow-amber-900/10 dark:border-amber-700/45 dark:from-amber-900/35 dark:via-amber-950/30 dark:to-transparent dark:text-amber-100 font-bold hover:shadow-md`;
  }

  if (pageIsOverview) {
    return `${base} border border-amber-200/55 bg-amber-50/40 text-muted-foreground shadow-sm shadow-amber-900/5 dark:border-amber-800/40 dark:bg-amber-950/30 hover:border-amber-300/70 hover:bg-amber-500/12 hover:text-foreground hover:shadow-md dark:hover:bg-amber-400/12`;
  }
  return `${base} border border-gray-200/90 bg-white/85 text-muted-foreground shadow-sm dark:border-white/12 dark:bg-zinc-900/50 hover:border-gray-300 hover:bg-gray-50 hover:text-foreground hover:shadow-md dark:hover:bg-white/10 dark:hover:border-white/18`;
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
    // Clients can now access the main dashboard overview
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
        item.title === 'POS' && item.counterManagerOnly
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
        // seo_manager: NO /dashboard/seo in sidebar — only Products and Inventory
      );
    }
    if (isClientRole(user?.role)) {
      return (
        item.href === '/dashboard' ||
        item.href === '/dashboard/products' ||
        item.href === '/dashboard/inventory' ||
        item.href === '/dashboard/orders' ||
        item.href === '/dashboard/invoices' ||
        item.href === '/dashboard/customers' ||
        item.href === '/dashboard/users' ||
        item.href === '/dashboard/subscription' ||
        item.href === '/super-admin/custom-domain' ||
        item.href === '/dashboard/add-employee' ||
        item.href === '/dashboard/support'
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
  const resourceSidebarItems = secondaryItems.filter((item) => {
    if (isCashierRole(user?.role)) {
      return false;
    }
    if (restrictedInventoryDashboardRole) {
      return false;
    }
    if ('hideForSuperAdmin' in item && item.hideForSuperAdmin && isSuperAdminRole(user?.role)) {
      return false;
    }
    if ('superAdminOnly' in item && item.superAdminOnly && !isSuperAdminRole(user?.role)) {
      return false;
    }
    if ('adminOnly' in item && item.adminOnly && !hasFullAdminPrivileges(user?.role)) {
      return false;
    }
    if ('helpCenter' in item && item.helpCenter) {
      if (isSuperAdminRole(user?.role) || normalizeRole(user?.role) === 'admin') return false;
      return isCustomerAccountRole(user?.role) || isStaffRole(user?.role);
    }
    if ('staffOnly' in item && item.staffOnly && !isStaffRole(user?.role)) {
      return false;
    }
    return true;
  });

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isOverview = location.pathname === '/dashboard';
  const isInventoryOrAnalytics = location.pathname === '/dashboard/inventory' || location.pathname === '/dashboard/analytics';
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
    // seo_manager: /dashboard/seo is NOT a valid route for them

  const shouldRedirectRestrictedRole =
    (restrictedInventoryDashboardRole || isCounterManagerRole(user?.role)) && !canAccessCurrentDashboardRoute;

  // SEO Manager: block /dashboard/seo and redirect to /dashboard/products
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

  // Admin SEO Access Guard - prevent admins from accessing SEO page
  if (isAdminRole && (location.pathname === '/dashboard/seo' || location.pathname.startsWith('/dashboard/seo/'))) {
    return <Navigate to="/dashboard" replace />;
  }

  // Trial Expiration Guard
  if (user?.isTrialExpired && !isSuperAdminRole(user?.role)) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/90 backdrop-blur-md p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden border border-rose-100 dark:border-rose-900/30"
        >
          <div className="bg-rose-50 dark:bg-rose-900/20 p-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-2xl bg-rose-600 flex items-center justify-center text-white shadow-xl shadow-rose-200 dark:shadow-none mb-6 animate-pulse">
              <AlertCircle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-rose-900 dark:text-rose-100 tracking-tight mb-2">Trial Expired</h2>
            <p className="text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
              Your 14-day trial has expired. Access to your dashboard and POS has been restricted.
            </p>
          </div>
          <div className="p-8 space-y-6">
            <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-2xl p-4 border border-gray-100 dark:border-zinc-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center font-medium">
                To continue using <span className="text-indigo-600 font-bold">{dsFinalBrandName}</span>, please contact the Super Admin to extend your trial or upgrade your plan.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => window.location.reload()}
                className="w-full h-12 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded-xl font-bold flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Check Status Again
              </Button>
              <Button
                variant="outline"
                onClick={handleLogout}
                className="w-full h-12 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-xl font-bold"
              >
                Sign Out
              </Button>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-zinc-800/80 px-8 py-4 text-center border-t border-gray-100 dark:border-zinc-700">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Powered by Daizy Homes Platform</p>
          </div>
        </motion.div>
      </div>
    );
  }

  const { themeKey } = useTheme();
  const clientId = user?.clientId || '';

  return (
    <SidebarProvider>
      <div
        className={`client-dashboard theme-${themeKey} ${
          isOverview || isInventoryOrAnalytics
            ? 'flex flex-col min-h-screen w-full overflow-x-hidden bg-[linear-gradient(145deg,#fdf6e3_0%,#ffffff_45%,#fff8dc_100%)] dark:bg-[linear-gradient(145deg,#1a1510_0%,#0c0a08_50%,#14110c_100%)]'
            : 'flex flex-col min-h-screen w-full overflow-x-hidden bg-[#fafafa] dark:bg-[#09090b]'
        }`}
      >
        <ImpersonationBanner />
        <div className="flex min-h-0 flex-1 w-full">
          {/* Sidebar */}
          <Sidebar
            collapsible="icon"
            className={
              isOverview || isInventoryOrAnalytics
                ? 'border-r border-amber-200/35 dark:border-amber-900/25 bg-white/55 dark:bg-zinc-950/55 backdrop-blur-xl shadow-[4px_0_24px_-12px_rgba(212,175,55,0.15)]'
                : 'border-r border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-xl'
            }
            style={
              user?.impersonation?.active
                ? { top: '48px', height: 'calc(100svh - 48px)' }
                : undefined
            }
          >
            <SidebarHeader className="group-data-[collapsible=icon]:h-14 h-16 flex items-center px-6">
              {/* Expanded header */}
              <div className="flex items-center gap-3 w-full group-data-[collapsible=icon]:hidden">
                {brandLogo ? (
                  <div
                    className={
                      isOverview
                        ? 'w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center bg-white dark:bg-zinc-900 shadow-lg shadow-amber-900/20 border border-amber-200/30 dark:border-amber-800/20'
                        : 'w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center bg-white dark:bg-zinc-900 shadow-lg border border-gray-200/50 dark:border-white/10'
                    }
                  >
                    <img
                      src={brandLogo}
                      alt={`${dsFinalBrandName} logo`}
                      className="w-full h-full object-contain p-0.5"
                    />
                  </div>
                ) : (
                  <div
                    className={
                      isOverview
                        ? 'w-8 h-8 rounded-xl bg-gradient-to-br from-[#d4af37] via-amber-500 to-amber-700 flex items-center justify-center text-white shadow-lg shadow-amber-900/20'
                        : 'w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg'
                    }
                  >
                    <span className="font-bold text-lg">E</span>
                  </div>
                )}
                <span className="font-bold text-xl tracking-tight flex-1">{dsFinalBrandName}</span>
                <SidebarTrigger className="size-7" />
              </div>
              {/* Collapsed header - centered toggle */}
              <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-full h-full">
                <SidebarTrigger className="size-7" />
              </div>
            </SidebarHeader>
            <SidebarContent className="px-2 pt-4 group-data-[collapsible=icon]:pt-8">
              <SidebarGroup>
                <SidebarGroupLabel
                  className={
                    mainSidebarItems.some(item => item.href && location.pathname.startsWith(item.href))
                      ? 'px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-900/55 dark:text-amber-200/50 group-data-[collapsible=icon]:hidden'
                      : 'px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden'
                  }
                >
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
                                  onClick={(e) => {
                                    navigate(href || '#');
                                  }}
                                  className={dashboardSidebarNavButtonClass(isActive || isSubActive, false)}
                                >
                                  {item.icon && <item.icon className={`w-5 h-5 shrink-0 ${isActive || isSubActive ? 'text-[#b8860b] dark:text-amber-300' : ''}`} />}
                                  <span className="group-data-[collapsible=icon]:hidden flex-1 min-w-0 text-left text-[16px] font-semibold tracking-wide leading-snug">
                                    {item.title}
                                  </span>
                                  <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden w-5 h-5 shrink-0" />
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
                                        <SidebarMenuSubButton asChild isActive={subIsActive} className="h-10 text-[15px] font-medium">
                                          <Link to={subItem.href}>
                                            {subItem.icon && <subItem.icon className={`w-4 h-4 mr-2 ${subIsActive ? 'text-[#b8860b] dark:text-amber-300' : ''}`} />}
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
                            className={dashboardSidebarNavButtonClass(isActive, false)}
                          >
                            <Link to={href || '#'}>
                              {item.icon && <item.icon
                                className={`w-5 h-5 shrink-0 ${isActive
                                  ? 'text-[#b8860b] dark:text-amber-300'
                                  : ''
                                  }`}
                              />}
                              <span className="group-data-[collapsible=icon]:hidden flex-1 min-w-0 text-left text-[16px] font-semibold tracking-wide leading-snug">
                                {item.title === 'Orders' && (isSuperAdminRole(user?.role) || isClientRole(user?.role))
                                  ? 'Sale'
                                  : item.title === 'Invoice'
                                    ? 'Quotes and Invoice'
                                    : item.title}</span>

                              {'badge' in item &&
                                item.badge != null &&
                                item.badge !== '' &&
                                (typeof item.badge === 'string' || typeof item.badge === 'number') && (
                                  <span
                                    className={
                                      isActive
                                        ? 'ml-auto shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-[#d4af37] to-amber-700 text-[10px] text-white flex items-center justify-center font-bold group-data-[collapsible=icon]:hidden shadow-sm'
                                        : 'ml-auto shrink-0 w-5 h-5 rounded-full bg-muted-foreground text-[10px] text-white flex items-center justify-center font-bold group-data-[collapsible=icon]:hidden'
                                    }
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

              <SidebarGroup className="mt-4">
                <SidebarGroupLabel className="sr-only">Resources</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-2">
                    {resourceSidebarItems.map((item) => {
                      const isActive = item.href ? location.pathname.startsWith(item.href) : false;
                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            tooltip={item.title}
                            className={dashboardSidebarNavButtonClass(isActive, false)}
                          >
                            <Link to={item.href || '#'}>
                              <item.icon
                                className={`w-5 h-5 shrink-0 ${isActive ? 'text-[#b8860b] dark:text-amber-300' : ''}`}
                              />
                              <span className="group-data-[collapsible=icon]:hidden flex-1 min-w-0 text-left text-[16px] font-semibold tracking-wide leading-snug">
                                {item.title}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter
              className={
                isOverview
                  ? 'p-4 border-t border-amber-200/25 dark:border-amber-900/20'
                  : 'p-4 border-t border-gray-100 dark:border-white/5'
              }
            >
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all duration-300 ease-out font-medium"
              >
                <LogOut className="w-5 h-5" />
                <span className="group-data-[collapsible=icon]:hidden">Sign Out</span>
              </button>
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>

          {/* Main Content Area */}
          <SidebarInset
            className={
              isOverview || isInventoryOrAnalytics
                ? 'flex flex-col flex-1 overflow-hidden bg-transparent'
                : 'flex flex-col flex-1 overflow-hidden bg-white dark:bg-[#09090b]'
            }
          >
            <DashboardNavbar premiumOverview={isOverview} />

            <main
              className={
                isOverview || isInventoryOrAnalytics
                  ? 'flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-7 lg:p-10 custom-scrollbar dashboard-overview-fade'
                  : location.pathname.startsWith('/dashboard/products')
                    ? 'flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar'
                    : 'flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 custom-scrollbar'
              }
              style={isOverview ? { fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" } : undefined}
            >
              <div className="w-full max-w-[1600px] mx-auto space-y-8 sm:space-y-10 min-w-0">
                {/* Welcome Section */}
                {location.pathname !== '/dashboard/products' && (
                  <motion.div
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-5"
                  >
                    <div>
                      <div
                        className={
                          isOverview
                            ? 'flex items-center gap-2 text-[#9a7b28] dark:text-amber-300/90 mb-3'
                            : 'flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2'
                        }
                      >
                        <TrendingUp className="w-4 h-4 shrink-0" />
                        <span className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em]">
                          {location.pathname === '/dashboard' ? 'Performance Live' :
                            location.pathname === '/dashboard/subscription' ? 'Subscription' :
                            location.pathname.split('/').pop()?.replace('-', ' ')}
                        </span>
                      </div>
                      <h1
                        className={
                          isOverview
                            ? 'text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 capitalize leading-tight'
                            : 'text-3xl font-extrabold tracking-tight capitalize'
                        }
                      >
                        {location.pathname === '/dashboard' ? 'Dashboard Overview' :
                          location.pathname === '/dashboard/subscription' ? 'Subscription & Upgrade Plan' :
                          location.pathname.split('/').pop()?.replace('-', ' ')}
                      </h1>
                      <p
                        className={
                          isOverview
                            ? 'text-muted-foreground mt-2 text-base max-w-xl leading-relaxed'
                            : 'text-muted-foreground mt-1'
                        }
                      >
                        {location.pathname === '/dashboard'
                          ? <>Welcome back, <span className="text-foreground font-semibold">{user?.name || 'Admin'}</span>. Here&apos;s what&apos;s happening today.</>
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
                            className={
                              isOverview
                                ? 'w-9 h-9 rounded-full border-2 border-white dark:border-zinc-900 bg-gray-200 overflow-hidden shadow-md ring-1 ring-amber-200/40 dark:ring-amber-900/30'
                                : 'w-8 h-8 rounded-full border-2 border-white dark:border-gray-900 bg-gray-200 overflow-hidden shadow-sm'
                            }
                          >
                            <img src={`https://i.pravatar.cc/150?u=${i + 10}`} alt="user" className="w-full h-full object-cover" />
                          </div>
                        ))}
                        <div
                          className={
                            isOverview
                              ? 'w-9 h-9 rounded-full border-2 border-white dark:border-zinc-900 bg-gradient-to-br from-amber-100 to-amber-200 text-[#8b6914] flex items-center justify-center text-[10px] font-bold shadow-md ring-1 ring-amber-300/50'
                              : 'w-8 h-8 rounded-full border-2 border-white dark:border-gray-900 bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shadow-sm'
                          }
                        >
                          +12
                        </div>
                      </div>
                      <span
                        className={
                          isOverview
                            ? 'text-xs text-muted-foreground font-semibold underline-offset-4 hover:underline hover:text-[#b8860b] cursor-pointer transition-colors duration-300'
                            : 'text-xs text-muted-foreground font-medium underline cursor-pointer'
                        }
                      >
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
                          <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } }}>
                            <DashboardCharts
                              analytics={isCustomerOverview ? userAnalyticsData : overviewData}
                              staffView={staff || isCustomerOverview}
                              revenueInInr={isSuperAdminRole(user?.role) || isClientRole(user?.role)}
                            />
                          </motion.div>
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
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1f2937;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
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
