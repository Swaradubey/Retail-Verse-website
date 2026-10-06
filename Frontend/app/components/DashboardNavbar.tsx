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

  const handleResultClick = (result: any) => {
    setShowDropdown(false);
    setSearchQuery("");

    const safeId = result.id ? encodeURIComponent(String(result.id)) : "";

    switch (result.type) {
      case "Client":
        navigate(`/super-admin/clients/${safeId}`);
        break;
      case "User":
        navigate(safeId ? `/dashboard/users?userId=${safeId}` : "/dashboard/users");
        break;
      case "Invoice":
        navigate(safeId ? `/dashboard/invoices?invoiceId=${safeId}` : "/dashboard/invoices");
        break;
      case "Quotation":
        navigate(safeId ? `/dashboard/invoices?quoteId=${safeId}` : "/dashboard/invoices");
        break;
      case "Product":
        navigate(safeId ? `/dashboard/products?productId=${safeId}` : "/dashboard/products");
        break;
      case "Order":
        navigate(safeId ? `/dashboard/orders?orderId=${safeId}` : "/dashboard/orders");
        break;
      case "Lead":
        navigate(safeId ? `/dashboard/customers/contact-form?contactId=${safeId}` : "/dashboard/customers/contact-form");
        break;
      default:
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
    <header className="sticky top-0 z-40 w-full border-b border-[#2563EB]/30 bg-[#0B1F3A] text-[#F8FAFC]">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <SidebarTrigger className="text-[#F8FAFC] hover:text-[#FF6B00]" />
          <div className="hidden md:flex relative w-64 max-w-[min(16rem,100%)]" ref={searchRef}>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563EB]" />
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
              className="pl-10 h-10 rounded-full border border-[#2563EB] bg-[#F8FAFC] text-[#0B1F3A] placeholder-[#0B1F3A]/50 focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:border-[#2563EB]"
            />
            
            <AnimatePresence>
              {showDropdown && searchQuery.trim() && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 w-full mt-2 bg-[#F8FAFC] text-[#0B1F3A] border border-[#0B1F3A] rounded-2xl shadow-xl overflow-hidden z-50 max-h-96 flex flex-col"
                >
                  <div className="overflow-y-auto custom-scrollbar flex-1">
                    {isSearching ? (
                      <div className="p-6 flex justify-center items-center">
                        <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
                      </div>
                    ) : searchResults.length > 0 ? (
                      <ul className="flex flex-col py-2">
                        {searchResults.map((res, idx) => (
                          <li 
                            key={idx} 
                            onClick={() => handleResultClick(res)}
                            className="group/res px-4 py-3 hover:bg-[#2563EB] hover:text-[#F8FAFC] cursor-pointer flex flex-col gap-1 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm text-[#0B1F3A] group-hover/res:text-[#F8FAFC] truncate">{res.name}</span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-[#2563EB] text-[#F8FAFC] group-hover/res:bg-[#FF6B00] rounded-md shrink-0">
                                {res.type}
                              </span>
                            </div>
                            {res.secondary && (
                              <span className="text-xs text-[#0B1F3A]/70 group-hover/res:text-[#F8FAFC]/80 truncate">{res.secondary}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-6 text-center text-sm text-[#0B1F3A]/70">
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
            className="rounded-full relative text-[#F8FAFC] hover:bg-[#2563EB]/20 hover:text-[#FF6B00] cursor-pointer"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#FF6B00] text-[#F8FAFC] text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-sm ring-2 ring-[#0B1F3A] leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      <Dialog open={notifOpen} onOpenChange={(open) => { setNotifOpen(open); if (!open) setSelectedNotification(null); }}>
        <DialogContent className="sm:max-w-md bg-[#F8FAFC] text-[#0B1F3A] border border-[#0B1F3A]">
          {selectedNotification ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="text-xs font-semibold text-[#0B1F3A]/70 hover:text-[#2563EB] transition-colors cursor-pointer"
                  aria-label="Back to notifications"
                >
                  ← Back
                </button>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#0B1F3A]/20">
                <div className="shrink-0 mt-0.5">
                  {selectedNotification.type === 'sale' ? (
                    <ShoppingCart className="w-6 h-6 text-[#FF6B00]" />
                  ) : selectedNotification.type === 'low_stock' ? (
                    <AlertTriangle className="w-6 h-6 text-[#FF6B00]" />
                  ) : (
                    <Package className="w-6 h-6 text-[#2563EB]" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <h3 className="text-base font-bold text-[#0B1F3A]">{selectedNotification.title}</h3>
                  <p className="text-sm text-[#0B1F3A]/80">{selectedNotification.message}</p>
                  {selectedNotification.orderId && (
                    <p className="text-xs text-[#0B1F3A]/60">Order ID: {selectedNotification.orderId}</p>
                  )}
                  {selectedNotification.productId && (
                    <p className="text-xs text-[#0B1F3A]/60">Product ID: {selectedNotification.productId}</p>
                  )}
                  <p className="text-[10px] text-[#0B1F3A]/60">{timeAgo(selectedNotification.createdAt)}</p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  onClick={() => handleViewDetailsNavigate(selectedNotification)}
                  className="h-9 rounded-xl px-4 text-xs font-semibold bg-[#FF6B00] text-[#F8FAFC] hover:bg-[#2563EB]"
                >
                  {selectedNotification.type === 'sale' ? 'View Order' : 'View Product'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2 text-[#0B1F3A]">
                  <Bell className="w-5 h-5 text-[#2563EB]" />
                  Notifications
                </DialogTitle>
                {unreadCount > 0 && (
                  <span className="mr-8 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FF6B00] text-[#F8FAFC]">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto -mx-6 px-6">
                {notifLoading ? (
                  <div className="flex justify-center items-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-[#0B1F3A]/60">
                    <Bell className="w-10 h-10 mb-3 opacity-30 text-[#0B1F3A]" />
                    <p className="text-sm">No new notifications</p>
                  </div>
                ) : (
                  <div className="py-2 space-y-1">
                    {notifications.map((n, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => handleNotificationClick(n)}
                        className="flex items-start gap-3 p-3 rounded-xl hover:bg-[#2563EB]/10 transition-colors cursor-pointer w-full text-left group"
                      >
                        <div className="shrink-0 mt-0.5">
                          {n.type === 'sale' ? (
                            <ShoppingCart className="w-4 h-4 text-[#FF6B00]" />
                          ) : n.type === 'low_stock' ? (
                            <AlertTriangle className="w-4 h-4 text-[#FF6B00]" />
                          ) : (
                            <Package className="w-4 h-4 text-[#2563EB]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#0B1F3A]">{n.title}</p>
                          <p className="text-xs text-[#0B1F3A]/70 truncate">{n.message}</p>
                          <p className="text-[10px] text-[#0B1F3A]/50 mt-1">{timeAgo(n.createdAt)}</p>
                        </div>
                        <span className="text-xs font-semibold text-[#2563EB] shrink-0 self-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
