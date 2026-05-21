import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  TrendingUp,
  Users,
  ShoppingCart,
  DollarSign,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  UserCheck,
  Receipt,
  TrendingDown,
  Wallet,
  Clock,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router';
import type { AdminAnalyticsData } from '../api/analytics';
import type { UserDashboardOverviewData } from '../api/orders';

type DashboardStatsProps = {
  analytics: AdminAnalyticsData | null;
  /** When false, KPIs are hidden (customer accounts on dashboard shell). */
  staffView: boolean;
  error?: string | null;
  /** Super Admin overview: replace Active Orders KPI with Active Customers (full analytics only). */
  superAdminOverview?: boolean;
  /** Storefront user `/dashboard` overview: Active Orders, Conversion Rate, Total Orders (backend-driven). */
  userOverview?: {
    metrics: UserDashboardOverviewData | null;
    error: string | null;
    pending: boolean;
  };
};

function formatCurrency(n: number, _useInr?: boolean): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatSignedPct(change: number | undefined): string {
  if (change == null || Number.isNaN(change)) return '—';
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

type StatCardConfig = {
  title: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconTint: string;
  ringAccent: string;
  description: string;
  path?: string;
};

export function DashboardStats({
  analytics,
  staffView,
  error,
  superAdminOverview,
  userOverview,
}: DashboardStatsProps) {
  const navigate = useNavigate();

  const stats = useMemo(() => {
    if (userOverview) {
      const { metrics, error: uErr, pending } = userOverview;
      const errText = uErr || undefined;
      if (pending && !errText) {
        return [
          {
            title: 'Active Orders',
            value: '—',
            change: '—',
            isPositive: true,
            icon: ShoppingCart,
            iconTint: 'from-teal-600 to-emerald-700',
            ringAccent: 'from-teal-300/50 via-emerald-100/30 to-teal-400/40',
            description: 'Loading…',
            path: '/dashboard/orders',
          },
          {
            title: 'Conversion Rate',
            value: '—',
            change: '—',
            isPositive: true,
            icon: TrendingUp,
            iconTint: 'from-violet-600 to-indigo-700',
            ringAccent: 'from-violet-300/45 via-indigo-100/25 to-violet-400/40',
            description: 'Loading…',
            path: '/dashboard/orders',
          },
          {
            title: 'Total Orders',
            value: '—',
            change: '—',
            isPositive: true,
            icon: Receipt,
            iconTint: 'from-sky-600 to-blue-700',
            ringAccent: 'from-sky-300/50 via-blue-100/30 to-sky-400/40',
            description: 'Loading…',
            path: '/dashboard/orders',
          },
        ];
      }
      if (errText && !metrics) {
        return [
          {
            title: 'Active Orders',
            value: '—',
            change: '—',
            isPositive: false,
            icon: ShoppingCart,
            iconTint: 'from-teal-600 to-emerald-700',
            ringAccent: 'from-teal-300/50 via-emerald-100/30 to-teal-400/40',
            description: errText,
            path: '/dashboard/orders',
          },
          {
            title: 'Conversion Rate',
            value: '—',
            change: '—',
            isPositive: false,
            icon: TrendingUp,
            iconTint: 'from-violet-600 to-indigo-700',
            ringAccent: 'from-violet-300/45 via-indigo-100/25 to-violet-400/40',
            description: errText,
            path: '/dashboard/orders',
          },
          {
            title: 'Total Orders',
            value: '—',
            change: '—',
            isPositive: false,
            icon: Receipt,
            iconTint: 'from-sky-600 to-blue-700',
            ringAccent: 'from-sky-300/50 via-blue-100/30 to-sky-400/40',
            description: errText,
            path: '/dashboard/orders',
          },
        ];
      }
      if (metrics) {
        const convCh = metrics.conversionRateChange ?? 0;
        const total = metrics.totalOrders ?? 0;
        return [
          {
            title: 'Active Orders',
            value: metrics.activeOrders.toLocaleString(),
            change: '—',
            isPositive: true,
            icon: ShoppingCart,
            iconTint: 'from-teal-600 to-emerald-700',
            ringAccent: 'from-teal-300/50 via-emerald-100/30 to-teal-400/40',
            description: 'In progress (not delivered or cancelled)',
            path: '/dashboard/orders',
          },
          {
            title: 'Conversion Rate',
            value: `${metrics.conversionRate.toFixed(2)}%`,
            change: formatSignedPct(convCh),
            isPositive: convCh >= 0,
            icon: TrendingUp,
            iconTint: 'from-violet-600 to-indigo-700',
            ringAccent: 'from-violet-300/45 via-indigo-100/25 to-violet-400/40',
            description: 'Website orders delivered · vs last month',
            path: '/dashboard/orders',
          },
          {
            title: 'Total Orders',
            value: total.toLocaleString(),
            change: '—',
            isPositive: true,
            icon: Receipt,
            iconTint: 'from-sky-600 to-blue-700',
            ringAccent: 'from-sky-300/50 via-blue-100/30 to-sky-400/40',
            description: 'All orders on your account',
            path: '/dashboard/orders',
          },
        ];
      }
      return [];
    }

    if (!staffView) {
      return [
        {
          title: 'Total Revenue',
          value: '—',
          change: '—',
          isPositive: true,
          icon: DollarSign,
          iconTint: 'from-[#d4af37] to-amber-700',
          ringAccent: 'from-amber-300/70 via-amber-100/40 to-amber-400/50',
          description: 'Team dashboard',
        },
        {
          title: superAdminOverview ? 'Active Customers' : 'Active Orders',
          value: '—',
          change: '—',
          isPositive: true,
          icon: superAdminOverview ? UserCheck : ShoppingCart,
          iconTint: 'from-teal-600 to-emerald-700',
          ringAccent: 'from-teal-300/50 via-emerald-100/30 to-teal-400/40',
          description: superAdminOverview ? 'Super Admin overview' : 'Team dashboard',
        },
        {
          title: 'New Customers',
          value: '—',
          change: '—',
          isPositive: true,
          icon: Users,
          iconTint: 'from-amber-600 to-orange-700',
          ringAccent: 'from-orange-300/50 via-amber-100/35 to-orange-400/45',
          description: 'Team dashboard',
        },
        {
          title: 'Conversion Rate',
          value: '—',
          change: '—',
          isPositive: true,
          icon: TrendingUp,
          iconTint: 'from-violet-600 to-indigo-700',
          ringAccent: 'from-violet-300/45 via-indigo-100/25 to-violet-400/40',
          description: 'Team dashboard',
        },
      ];
    }

    const s = analytics?.summary;
    // Clean fallback: never show raw backend error text inside stat cards
    const cardErrorDesc = error ? 'Could not load' : 'Loading\u2026';
    if (!s) {
      return [
        {
          title: 'Total Revenue',
          value: error ? 'Error' : '—',
          change: '—',
          isPositive: true,
          icon: DollarSign,
          iconTint: 'from-[#d4af37] to-[#b87500]',
          ringAccent: 'from-amber-300/70 via-amber-100/40 to-amber-400/50',
          description: cardErrorDesc,
          path: '/dashboard/analytics',
        },
        {
          title: 'Orders This Month',
          value: '—',
          change: '—',
          isPositive: true,
          icon: ShoppingCart,
          iconTint: 'from-[#d4af37] to-[#b87500]',
          ringAccent: 'from-amber-300/70 via-amber-100/40 to-amber-400/50',
          description: cardErrorDesc,
          path: '/dashboard/orders',
        },
        {
          title: 'Average Order Value',
          value: '—',
          change: '—',
          isPositive: true,
          icon: TrendingUp,
          iconTint: 'from-[#d4af37] to-[#b87500]',
          ringAccent: 'from-amber-300/70 via-amber-100/40 to-amber-400/50',
          description: cardErrorDesc,
          path: '/dashboard/analytics',
        },
        {
          title: 'Top Product Sales',
          value: '—',
          change: '—',
          isPositive: true,
          icon: Package,
          iconTint: 'from-[#d4af37] to-[#b87500]',
          ringAccent: 'from-amber-300/70 via-amber-100/40 to-amber-400/50',
          description: cardErrorDesc,
          path: '/dashboard/products',
        },
      ];
    }

    const revenue = s.totalRevenue ?? 0;
    const revChange = s.totalRevenueChange ?? 0;
    const orders = s.orderCount ?? 0;
    const ordChange = s.orderCountChange ?? 0;
    const avgOrder = s.avgOrderValue ?? 0;
    const avgChange = s.avgOrderValueChange ?? 0;
    const topProduct = analytics?.topProducts?.[0];
    const useInr = !!superAdminOverview;

    return [
      {
        title: 'Total Revenue',
        value: formatCurrency(revenue, useInr),
        change: formatSignedPct(revChange),
        isPositive: revChange >= 0,
        icon: DollarSign,
        iconTint: 'from-[#d4af37] to-[#b87500]',
        ringAccent: 'from-amber-300/70 via-amber-100/40 to-amber-400/50',
        description: 'vs last month',
        path: '/dashboard/analytics',
      },
      {
        title: 'Orders This Month',
        value: orders.toLocaleString(),
        change: formatSignedPct(ordChange),
        isPositive: ordChange >= 0,
        icon: ShoppingCart,
        iconTint: 'from-[#d4af37] to-[#b87500]',
        ringAccent: 'from-amber-300/70 via-amber-100/40 to-amber-400/50',
        description: 'This month',
        path: '/dashboard/orders',
      },
      {
        title: 'Average Order Value',
        value: formatCurrency(avgOrder, useInr),
        change: formatSignedPct(avgChange),
        isPositive: avgChange >= 0,
        icon: TrendingUp,
        iconTint: 'from-[#d4af37] to-[#b87500]',
        ringAccent: 'from-amber-300/70 via-amber-100/40 to-amber-400/50',
        description: 'vs last month',
        path: '/dashboard/analytics',
      },
      {
        title: 'Top Product Sales',
        value: topProduct ? formatCurrency(topProduct.sales, useInr) : 'No sales yet',
        change: topProduct ? formatSignedPct(topProduct.growthPercent) : '—',
        isPositive: (topProduct?.growthPercent ?? 0) >= 0,
        icon: Package,
        iconTint: 'from-[#d4af37] to-[#b87500]',
        ringAccent: 'from-amber-300/70 via-amber-100/40 to-amber-400/50',
        description: topProduct?.name ? topProduct.name.slice(0, 28) : 'This month',
        path: '/dashboard/products',
      },
    ];
  }, [analytics, staffView, error, superAdminOverview, userOverview]);

  const superAdminMonthKpis = useMemo((): StatCardConfig[] | null => {
    if (!superAdminOverview || !staffView) return null;

    const s = analytics?.summary;
    const baseError = error ? 'Error' : '—';
    const loadingDesc = error ? 'Could not load' : 'Loading…';

    if (!s) {
      return [
        {
          title: 'SALES THIS MONTH',
          value: baseError,
          change: '—',
          isPositive: true,
          icon: Receipt,
          iconTint: 'from-sky-600 to-blue-700',
          ringAccent: 'from-sky-300/50 via-blue-100/30 to-sky-400/40',
          description: loadingDesc,
          path: '/dashboard/analytics',
        },
        {
          title: 'LOSS THIS MONTH',
          value: baseError,
          change: '—',
          isPositive: true,
          icon: TrendingDown,
          iconTint: 'from-rose-600 to-red-700',
          ringAccent: 'from-rose-300/50 via-red-100/30 to-rose-400/40',
          description: loadingDesc,
          path: '/dashboard/analytics',
        },
        {
          title: 'PROFIT THIS MONTH',
          value: baseError,
          change: '—',
          isPositive: true,
          icon: Wallet,
          iconTint: 'from-emerald-600 to-teal-700',
          ringAccent: 'from-emerald-300/50 via-teal-100/30 to-emerald-400/40',
          description: loadingDesc,
          path: '/dashboard/analytics',
        },
      ];
    }

    const sales = s.salesThisMonth ?? 0;
    const loss = s.lossThisMonth ?? 0;
    const profit = s.profitThisMonth ?? Math.round((sales - loss) * 100) / 100;

    return [
      {
        title: 'SALES THIS MONTH',
        value: formatCurrency(sales, true),
        change: '—',
        isPositive: true,
        icon: Receipt,
        iconTint: 'from-sky-600 to-blue-700',
        ringAccent: 'from-sky-300/50 via-blue-100/30 to-sky-400/40',
        description: 'All orders this month',
        path: '/dashboard/analytics',
      },
      {
        title: 'LOSS THIS MONTH',
        value: formatCurrency(loss, true),
        change: '—',
        isPositive: loss === 0,
        icon: TrendingDown,
        iconTint: 'from-rose-600 to-red-700',
        ringAccent: 'from-rose-300/50 via-red-100/30 to-rose-400/40',
        description: 'Refunds & cancellations',
        path: '/dashboard/analytics',
      },
      {
        title: 'PROFIT THIS MONTH',
        value: formatCurrency(profit, true),
        change: '—',
        isPositive: profit >= 0,
        icon: Wallet,
        iconTint: 'from-emerald-600 to-teal-700',
        ringAccent: 'from-emerald-300/50 via-teal-100/30 to-emerald-400/40',
        description: 'Paid revenue this month',
        path: '/dashboard/analytics',
      },
    ];
  }, [analytics, staffView, error, superAdminOverview]);

  const renderKpiCard = (stat: StatCardConfig, index: number, delayOffset: number) => (
    <motion.div
      key={stat.title}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: (delayOffset + index) * 0.08,
        duration: 0.35,
        ease: [0.22, 1, 0.36, 1],
      }}
      onClick={() => stat.path && navigate(stat.path)}
      onKeyDown={(e) => {
        if (stat.path && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          navigate(stat.path);
        }
      }}
      tabIndex={stat.path ? 0 : undefined}
      className={`group relative rounded-[1.125rem] overflow-hidden bg-gradient-to-br from-[#fff7df] via-[#fffaf0] to-[#ffe7a3] border border-[#f6d365]/60 shadow-md shadow-amber-200/35 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-[0_20px_48px_-12px_rgba(180,130,30,0.30)] ${
        stat.path ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-amber-400' : ''
      }`}
    >
      <Card className="relative overflow-hidden rounded-[1.125rem] border-0 bg-transparent shadow-none">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 pt-5 px-5">
          <CardTitle className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] text-amber-900/75 group-hover:text-amber-900 transition-colors duration-300">
            {stat.title}
          </CardTitle>
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#d4af37] to-[#b87500] text-white shadow-lg shadow-amber-700/20 ring-4 ring-white/70 transition-transform duration-300 ease-out group-hover:scale-105"
          >
            <stat.icon className="h-5 w-5" strokeWidth={2.25} />
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          <div className="flex flex-col gap-1">
            <span className="text-2xl sm:text-[1.75rem] font-extrabold tracking-tight text-zinc-900 tabular-nums">
              {stat.value}
            </span>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <div
                className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full transition-colors duration-300 ${
                  stat.isPositive
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {stat.isPositive ? (
                  <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                )}
                {stat.change}
              </div>
              <span className="text-[11px] text-amber-900/55 font-medium tracking-wide">
                {stat.description}
              </span>
            </div>
          </div>
        </CardContent>
        <div
          className="pointer-events-none absolute -right-8 -bottom-10 h-36 w-36 rounded-full bg-amber-200 opacity-[0.22] blur-3xl transition-opacity duration-300 group-hover:opacity-[0.35]"
        />
      </Card>
    </motion.div>
  );

  const overviewGridClass = userOverview
    ? 'grid gap-5 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto w-full'
    : 'grid gap-5 sm:gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4';

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className={overviewGridClass}>
        {stats.map((stat, index) => renderKpiCard(stat as StatCardConfig, index, 0))}
      </div>
      {superAdminMonthKpis ? (
        <div className="grid gap-5 sm:gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {superAdminMonthKpis.map((stat, index) => renderKpiCard(stat, index, stats.length))}
        </div>
      ) : null}

      {superAdminOverview && analytics?.trialStats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="grid grid-cols-1"
        >
          <Card className="overflow-hidden border-indigo-100 bg-white shadow-lg shadow-indigo-100/20">
            <CardHeader className="bg-indigo-50/50 border-b border-indigo-100 py-4 px-6 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-indigo-900">Trial Status Overview</CardTitle>
                  <p className="text-xs text-indigo-600 font-medium">Monitoring client trial periods</p>
                </div>
              </div>
              <div className="text-xs font-bold px-3 py-1 bg-white border border-indigo-200 rounded-full text-indigo-700 shadow-sm">
                Total: {analytics.trialStats.totalTrialClients}
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Active Trials</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-900">{analytics.trialStats.activeTrials}</span>
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Live</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Expired</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-900">{analytics.trialStats.expiredTrials}</span>
                    <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">Ended</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Expiring Soon</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-900">{analytics.trialStats.expiringSoon}</span>
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">≤ 3 days</span>
                  </div>
                </div>
                <div className="flex items-center justify-end">
                  <button 
                    onClick={() => navigate('/super-admin/clients')}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg"
                  >
                    View All Clients →
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
