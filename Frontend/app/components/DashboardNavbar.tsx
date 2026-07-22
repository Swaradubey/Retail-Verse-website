import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  Search, 
  Loader2,
  ShoppingCart,
  AlertTriangle,
  Package
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { SidebarTrigger } from './ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from './ui/dialog';
import ApiService from '../api/apiService';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

type DashboardNavbarProps = {
  /** Premium styling when viewing Dashboard Overview only */
  premiumOverview?: boolean;
};

export function DashboardNavbar({ premiumOverview = false }: DashboardNavbarProps) {
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<any | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const [lastSeenNotificationTime, setLastSeenNotificationTime] = useState<string | null>(
    localStorage.getItem("lastSeenNotificationTime")
  );

  const unreadCount = notifications.filter((notification) => {
    return !lastSeenNotificationTime || new Date(notification.createdAt) > new Date(lastSeenNotificationTime);
  }).length;

  useEffect(() => {
    if (!premiumOverview) return;
    const id = 'dashboard-overview-font-inter';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(link);
    return () => {
      /* keep font cached for session; do not remove to avoid layout shift on quick nav */
    };
  }, [premiumOverview]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      try {
        setIsSearching(true);
        const res = await ApiService.get<{success: boolean, data: any[]}>(`/search?q=${encodeURIComponent(searchQuery.trim())}`, { pageName: 'GlobalSearch' });
        if (res.success && res.data) {
          setSearchResults(res.data);
        }
      } catch (err) {
        console.error("Search error", err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  /**
   * Centralized route map for global search results.
   * Only uses routes that are registered in routes.tsx — never generates 404s.
   */
  const handleResultClick = (result: any) => {
    setShowDropdown(false);
    setSearchQuery("");

    const safeId = result.id ? encodeURIComponent(String(result.id)) : "";

    switch (result.type) {
      // CLIENT → detail page exists at /super-admin/clients/:clientId
      case "Client":
        navigate(`/super-admin/clients/${safeId}`);
        break;

      // USER / staff → /dashboard/users list page (no detail route exists)
      case "User":
        navigate(safeId ? `/dashboard/users?userId=${safeId}` : "/dashboard/users");
        break;

      // INVOICE → /dashboard/invoices list page
      case "Invoice":
        navigate(safeId ? `/dashboard/invoices?invoiceId=${safeId}` : "/dashboard/invoices");
        break;

      // QUOTATION → quotes live on the same invoices page
      case "Quotation":
        navigate(safeId ? `/dashboard/invoices?quoteId=${safeId}` : "/dashboard/invoices");
        break;

      // PRODUCT → /dashboard/products list page
      case "Product":
        navigate(safeId ? `/dashboard/products?productId=${safeId}` : "/dashboard/products");
        break;

      // ORDER → /dashboard/orders list page
      case "Order":
        navigate(safeId ? `/dashboard/orders?orderId=${safeId}` : "/dashboard/orders");
        break;

      // LEAD / Contact form → /dashboard/customers/contact-form
      case "Lead":
        navigate(safeId ? `/dashboard/customers/contact-form?contactId=${safeId}` : "/dashboard/customers/contact-form");
        break;

      default:
        // Fallback: go to dashboard overview — never 404
        navigate("/dashboard");
        break;
    }
  };

  const fetchNotifications = async () => {
    setNotifLoading(true);
    try {
      const res = await ApiService.get<{ success: boolean; notifications: any[]; unreadCount: number }>(
        "/notifications",
        { pageName: "Notifications" }
      );
      if (res.success && res.notifications) {
        setNotifications(res.notifications);
      } else {
        setNotifications([]);
      }
    } catch {
      setNotifications([]);
    } finally {
      setNotifLoading(false);
    }
  };

  const handleNotifClick = () => {
    setNotifOpen(true);
    fetchNotifications();
    const now = new Date().toISOString();
    localStorage.setItem("lastSeenNotificationTime", now);
    setLastSeenNotificationTime(now);
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleNotificationClick = (notification: any) => {
    setSelectedNotification(notification);
  };

  const handleBackToList = () => {
    setSelectedNotification(null);
  };

  const handleViewDetailsNavigate = (notification: any) => {
    setNotifOpen(false);
    setSelectedNotification(null);
    if (notification.type === 'sale') {
      const orderId = notification.orderId || notification.relatedId || notification.id;
      navigate(`/dashboard/orders?orderId=${orderId}`);
    } else if (notification.type === 'low_stock') {
      const productId = notification.productId || notification.relatedId || notification.id;
      navigate(`/dashboard/products?productId=${productId}`);
    } else {
      navigate('/dashboard/orders');
    }
  };

  return (
    <header
      className={
        premiumOverview
          ? 'sticky top-0 z-40 w-full border-b border-amber-200/30 dark:border-amber-900/20 bg-white/65 dark:bg-zinc-950/70 backdrop-blur-xl shadow-[0_1px_0_rgba(212,175,55,0.08),0_8px_24px_-8px_rgba(0,0,0,0.08)]'
          : 'sticky top-0 z-40 w-full border-b bg-white/50 dark:bg-black/50 backdrop-blur-xl'
      }
    >
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <div className="hidden md:flex relative w-64 max-w-[min(16rem,100%)]" ref={searchRef}>
            <Search
              className={
                premiumOverview
                  ? 'absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-700/50 dark:text-amber-400/50'
                  : 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground'
              }
            />
            <Input
              placeholder="Search all..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => {
                if (searchQuery.trim()) setShowDropdown(true);
              }}
              className={
                premiumOverview
                  ? 'pl-10 h-10 rounded-full border border-amber-200/40 bg-white/80 dark:bg-zinc-900/60 dark:border-amber-900/30 shadow-sm transition-all duration-300 focus-visible:ring-2 focus-visible:ring-amber-400/40 focus-visible:border-amber-300/60'
                  : 'pl-10 bg-gray-100/50 dark:bg-white/5 border-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded-xl'
              }
            />
            
            <AnimatePresence>
              {showDropdown && searchQuery.trim() && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.15 }}
                  className={
                    premiumOverview 
                      ? "absolute top-full left-0 w-full mt-2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-amber-200/40 dark:border-amber-900/30 rounded-2xl shadow-xl overflow-hidden z-50 max-h-96 flex flex-col"
                      : "absolute top-full left-0 w-full mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden z-50 max-h-96 flex flex-col"
                  }
                >
                  <div className="overflow-y-auto custom-scrollbar flex-1">
                    {isSearching ? (
                      <div className="p-6 flex justify-center items-center">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : searchResults.length > 0 ? (
                      <ul className="flex flex-col py-2">
                        {searchResults.map((res, idx) => (
                          <li 
                            key={idx} 
                            onClick={() => handleResultClick(res)}
                            className={
                              premiumOverview
                                ? "px-4 py-3 hover:bg-amber-50 dark:hover:bg-amber-900/20 cursor-pointer flex flex-col gap-1 transition-colors"
                                : "px-4 py-3 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer flex flex-col gap-1 transition-colors"
                            }
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{res.name}</span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-gray-100 dark:bg-zinc-800 rounded-md text-gray-500 dark:text-gray-400 shrink-0">
                                {res.type}
                              </span>
                            </div>
                            {res.secondary && (
                              <span className="text-xs text-muted-foreground truncate">{res.secondary}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        No results found for "{searchQuery}"
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNotifClick}
            className={
              premiumOverview
                ? 'rounded-full transition-all duration-300 hover:bg-amber-500/10 dark:hover:bg-amber-400/10 relative'
                : 'rounded-full hover:bg-gray-100 dark:hover:bg-white/10 relative'
            }
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-sm ring-2 ring-white dark:ring-zinc-950 leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>


        </div>
      </div>

      <Dialog open={notifOpen} onOpenChange={(open) => { setNotifOpen(open); if (!open) setSelectedNotification(null); }}>
        <DialogContent className={premiumOverview ? 'sm:max-w-md border-amber-200/40 dark:border-amber-900/30' : 'sm:max-w-md'}>
          {selectedNotification ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Back to notifications"
                >
                  ← Back
                </button>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 dark:bg-white/5">
                <div className="shrink-0 mt-0.5">
                  {selectedNotification.type === 'sale' ? (
                    <ShoppingCart className="w-6 h-6 text-green-600 dark:text-green-400" />
                  ) : selectedNotification.type === 'low_stock' ? (
                    <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Package className="w-6 h-6 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <h3 className="text-base font-bold">{selectedNotification.title}</h3>
                  <p className="text-sm text-muted-foreground">{selectedNotification.message}</p>
                  {selectedNotification.orderId && (
                    <p className="text-xs text-muted-foreground/60">Order ID: {selectedNotification.orderId}</p>
                  )}
                  {selectedNotification.productId && (
                    <p className="text-xs text-muted-foreground/60">Product ID: {selectedNotification.productId}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60">{timeAgo(selectedNotification.createdAt)}</p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  onClick={() => handleViewDetailsNavigate(selectedNotification)}
                  className="h-9 rounded-xl px-4 text-xs font-semibold"
                >
                  {selectedNotification.type === 'sale' ? 'View Order' : 'View Product'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notifications
                </DialogTitle>
                {unreadCount > 0 && (
                  <span className="mr-8 text-xs font-normal px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto -mx-6 px-6">
                {notifLoading ? (
                  <div className="flex justify-center items-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <Bell className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">No new notifications</p>
                  </div>
                ) : (
                  <div className="py-2 space-y-1">
                    {notifications.map((n, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => handleNotificationClick(n)}
                        className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer w-full text-left group"
                      >
                        <div className="shrink-0 mt-0.5">
                          {n.type === 'sale' ? (
                            <ShoppingCart className="w-4 h-4 text-green-600 dark:text-green-400" />
                          ) : n.type === 'low_stock' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <Package className="w-4 h-4 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{n.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{n.message}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                        </div>
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0 self-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          Details →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </header>
  );
}
