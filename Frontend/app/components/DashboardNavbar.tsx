import React, { useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { PanelLeft, ChevronRight } from 'lucide-react';
import { useSidebar } from './ui/sidebar';
import { useAuth } from '../context/AuthContext';
import { isSuperAdminRole, isClientRole } from '../utils/staffRoles';

export type DashboardNavItem = {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
  badge?: string | number;
  subItems?: Array<{ title: string; href: string; icon?: React.ComponentType<{ className?: string }> }>;
  [key: string]: unknown;
};

type DashboardNavbarProps = {
  premiumOverview?: boolean;
  items?: DashboardNavItem[];
};

export function DashboardNavbar({ items = [] }: DashboardNavbarProps) {
  const { toggleSidebar } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  // Auto-scroll the active tab into view horizontally on mobile
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [location.pathname]);

  if (!items || items.length === 0) {
    return null;
  }

  // Determine current active item title
  const currentActiveItem = items.find((item) => {
    const href = item.href;
    if (href === '/dashboard') return location.pathname === '/dashboard';
    if (href) return location.pathname.startsWith(href);
    return item.title === 'Overview' && location.pathname === '/dashboard';
  });

  const activeTitle = currentActiveItem
    ? (currentActiveItem.title === 'Invoice'
        ? 'Quotes & Invoice'
        : currentActiveItem.title)
    : 'Dashboard';

  return (
    <>
      {/* ──────────────────────────────────────────────────────────────────
          MOBILE-ONLY DASHBOARD NAVIGATION BAR (md:hidden)
          Occupies 0px on desktop to preserve desktop clean UI.
      ────────────────────────────────────────────────────────────────── */}
      <div className="md:hidden w-full bg-[#0B1F3A] text-[#F8FAFC] border-b border-[#2563EB]/30 shadow-md">
        {/* Top Control Bar: Menu Trigger + Active Section Title */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/10 bg-[#0B1F3A]">
          <button
            type="button"
            onClick={toggleSidebar}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] text-[#F8FAFC] text-xs font-bold tracking-wide shadow-xs active:scale-95 transition-all cursor-pointer"
            aria-label="Open sidebar menu"
          >
            <PanelLeft className="w-4 h-4 text-white" />
            <span>Dashboard Menu</span>
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-black/30 text-[10px] font-extrabold text-[#F8FAFC]">
              {items.length}
            </span>
          </button>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F8FAFC]/90">
            <span className="w-2 h-2 rounded-full bg-[#FF6B00] animate-pulse" />
            <span className="truncate max-w-[140px] text-[12px]">{activeTitle}</span>
          </div>
        </div>

        {/* Horizontal Quick-Access Scrollable Pills */}
        <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 scrollbar-none no-scrollbar">
          {items.map((item) => {
            const href = item.href;
            const isActive =
              href === '/dashboard'
                ? location.pathname === '/dashboard'
                : href
                  ? location.pathname.startsWith(href)
                  : item.title === 'Overview' && location.pathname === '/dashboard';

            const displayTitle =
              item.title === 'Invoice'
                ? 'Quotes & Invoice'
                : item.title;

            const Icon = item.icon;

            return (
              <button
                key={item.title}
                ref={isActive ? activeTabRef : null}
                type="button"
                onClick={() => {
                  if (href) {
                    navigate(href, href === '/pos' ? { state: { fromDashboard: location.pathname } } : undefined);
                  }
                }}
                className={`flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-[#2563EB] text-[#F8FAFC] border border-[#2563EB] shadow-md font-bold scale-[1.02]'
                    : 'bg-white/10 text-[#F8FAFC]/80 border border-white/10 hover:bg-[#2563EB]/20 hover:text-white'
                }`}
              >
                {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#F8FAFC]' : 'text-[#F8FAFC]/70'}`} />}
                <span className="whitespace-nowrap">{displayTitle}</span>
                {item.badge != null && item.badge !== '' && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#FF6B00] text-[10px] text-white font-extrabold shadow-xs">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          MOBILE FLOATING ACTION BUTTON (FAB)
          Quick 1-tap sidebar drawer launcher anywhere on mobile.
      ────────────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={toggleSidebar}
        className="md:hidden fixed bottom-5 right-4 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-[#0B1F3A] text-[#F8FAFC] border-2 border-[#2563EB] shadow-2xl hover:bg-[#2563EB] active:scale-95 transition-all cursor-pointer backdrop-blur-xs"
        aria-label="Toggle Dashboard Menu"
      >
        <PanelLeft className="w-4 h-4 text-[#FF6B00]" />
        <span className="text-xs font-extrabold tracking-wide">Menu</span>
      </button>
    </>
  );
}

export default DashboardNavbar;
