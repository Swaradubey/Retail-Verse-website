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
            description: 'Loading…',
            path: '/dashboard/orders',
          },
          {
            title: 'Conversion Rate',
            value: '—',
            change: '—',
            isPositive: true,
            icon: TrendingUp,
            description: 'Loading…',
            path: '/dashboard/orders',
          },
          {
            title: 'Total Orders',
            value: '—',
            change: '—',
            isPositive: true,
            icon: Receipt,
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
            description: errText,
            path: '/dashboard/orders',
          },
          {
            title: 'Conversion Rate',
            value: '—',
            change: '—',
            isPositive: false,
            icon: TrendingUp,
            description: errText,
            path: '/dashboard/orders',
          },
          {
            title: 'Total Orders',
            value: '—',
            change: '—',
            isPositive: false,
            icon: Receipt,
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
            description: 'In progress',
            path: '/dashboard/orders',
          },
          {
            title: 'Conversion Rate',
            value: `${metrics.conversionRate.toFixed(2)}%`,
            change: formatSignedPct(convCh),
            isPositive: convCh >= 0,
            icon: TrendingUp,
            description: 'Website orders delivered · vs last month',
            path: '/dashboard/orders',
          },
          {
            title: 'Total Orders',
            value: total.toLocaleString(),
            change: '—',
            isPositive: true,
            icon: Receipt,
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
          description: 'Team dashboard',
        },
        {
          title: superAdminOverview ? 'Active Customers' : 'Active Orders',
          value: '—',
          change: '—',
          isPositive: true,
          icon: superAdminOverview ? UserCheck : ShoppingCart,
          description: superAdminOverview ? 'Super Admin overview' : 'Team dashboard',
        },
        {
          title: 'New Customers',
          value: '—',
          change: '—',
          isPositive: true,
          icon: Users,
          description: 'Team dashboard',
        },
        {
          title: 'Conversion Rate',
          value: '—',
          change: '—',
          isPositive: true,
          icon: TrendingUp,
          description: 'Team dashboard',
        },
      ];
    }

    const s = analytics?.summary;
    const cardErrorDesc = error ? 'Could not load' : 'Loading…';
    if (!s) {
      return [
        {
          title: 'Total Revenue',
          value: error ? 'Error' : '—',
          change: '—',
          isPositive: true,
          icon: DollarSign,
          description: cardErrorDesc,
          path: '/dashboard/analytics',
        },
        {
          title: 'Orders This Month',
          value: '—',
          change: '—',
          isPositive: true,
          icon: ShoppingCart,
          description: cardErrorDesc,
          path: '/dashboard/orders',
        },
        {
          title: 'Average Order Value',
          value: '—',
          change: '—',
          isPositive: true,
          icon: TrendingUp,
          description: cardErrorDesc,
          path: '/dashboard/analytics',
        },
        {
          title: 'Top Product Sales',
          value: '—',
          change: '—',
          isPositive: true,
          icon: Package,
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
        description: 'vs last month',
        path: '/dashboard/analytics',
      },
      {
        title: 'Orders This Month',
        value: orders.toLocaleString(),
        change: formatSignedPct(ordChange),
        isPositive: ordChange >= 0,
        icon: ShoppingCart,
        description: 'This month',
        path: '/dashboard/orders',
      },
      {
        title: 'Average Order Value',
        value: formatCurrency(avgOrder, useInr),
        change: formatSignedPct(avgChange),
        isPositive: avgChange >= 0,
        icon: TrendingUp,
        description: 'vs last month',
        path: '/dashboard/analytics',
      },
      {
        title: 'Top Product Sales',
        value: topProduct ? formatCurrency(topProduct.sales, useInr) : 'No sales yet',
        change: topProduct ? formatSignedPct(topProduct.growthPercent) : '—',
        isPositive: (topProduct?.growthPercent ?? 0) >= 0,
        icon: Package,
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
          description: loadingDesc,
          path: '/dashboard/analytics',
        },
        {
          title: 'LOSS THIS MONTH',
          value: baseError,
          change: '—',
          isPositive: true,
          icon: TrendingDown,
          description: loadingDesc,
          path: '/dashboard/analytics',
        },
        {
          title: 'PROFIT THIS MONTH',
          value: baseError,
          change: '—',
          isPositive: true,
          icon: Wallet,
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
        description: 'All orders this month',
        path: '/dashboard/analytics',
      },
      {
        title: 'LOSS THIS MONTH',
        value: formatCurrency(loss, true),
        change: '—',
        isPositive: loss === 0,
        icon: TrendingDown,
        description: 'Refunds & cancellations',
        path: '/dashboard/analytics',
      },
      {
        title: 'PROFIT THIS MONTH',
        value: formatCurrency(profit, true),
        change: '—',
        isPositive: profit >= 0,
        icon: Wallet,
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
      className={`group relative rounded-[1.125rem] overflow-hidden bg-[#F8FAFC] border border-[#0B1F3A]/20 shadow-md transition-all duration-300 ease-out hover:scale-[1.02] hover:border-[#2563EB] hover:shadow-lg ${
        stat.path ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]' : ''
      }`}
    >
      <Card className="relative overflow-hidden rounded-[1.125rem] border-0 bg-transparent shadow-none">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 pt-4 px-4">
          <CardTitle className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] text-[#0B1F3A]/80 group-hover:text-[#2563EB] transition-colors duration-300">
            {stat.title}
          </CardTitle>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2563EB] text-[#F8FAFC] shadow-md group-hover:scale-105 group-hover:bg-[#FF6B00] transition-all duration-300"
          >
            <stat.icon className="h-4 w-4" strokeWidth={2.5} />
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="flex flex-col gap-1">
            <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#0B1F3A] tabular-nums">
              {stat.value}
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <div
                className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full text-[#F8FAFC] transition-colors duration-300 ${
                  stat.isPositive
                    ? 'bg-[#2563EB]'
                    : 'bg-[#FF6B00]'
                }`}
              >
                {stat.isPositive ? (
                  <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                )}
                {stat.change}
              </div>
              <span className="text-[11px] text-[#0B1F3A]/70 font-medium tracking-wide">
                {stat.description}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  const overviewGridClass = userOverview
    ? 'grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto w-full'
    : 'grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className={overviewGridClass}>
        {stats.map((stat, index) => renderKpiCard(stat as StatCardConfig, index, 0))}
      </div>
      {superAdminMonthKpis ? (
        <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
          <Card className="overflow-hidden border border-[#0B1F3A]/20 bg-[#F8FAFC] shadow-md rounded-2xl">
            <CardHeader className="bg-[#0B1F3A] text-[#F8FAFC] border-b border-[#2563EB]/30 py-4 px-6 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FF6B00] flex items-center justify-center text-[#F8FAFC] shadow-md">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-[#F8FAFC]">Trial Status Overview</CardTitle>
                  <p className="text-xs text-[#2563EB] font-medium">Monitoring client trial periods</p>
                </div>
              </div>
              <div className="text-xs font-bold px-3 py-1 bg-[#2563EB] border border-[#2563EB] rounded-full text-[#F8FAFC] shadow-sm">
                Total: {analytics.trialStats.totalTrialClients}
              </div>
            </CardHeader>
            <CardContent className="p-6 bg-[#F8FAFC]">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#0B1F3A]/70">Active Trials</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-[#0B1F3A]">{analytics.trialStats.activeTrials}</span>
                    <span className="text-xs font-semibold text-[#F8FAFC] bg-[#2563EB] px-2 py-0.5 rounded">Live</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#0B1F3A]/70">Expired</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-[#0B1F3A]">{analytics.trialStats.expiredTrials}</span>
                    <span className="text-xs font-semibold text-[#F8FAFC] bg-[#FF6B00] px-2 py-0.5 rounded">Ended</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#0B1F3A]/70">Expiring Soon</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-[#0B1F3A]">{analytics.trialStats.expiringSoon}</span>
                    <span className="text-xs font-semibold text-[#F8FAFC] bg-[#0B1F3A] px-2 py-0.5 rounded">≤ 3 days</span>
                  </div>
                </div>
                <div className="flex items-center justify-end">
                  <button 
                    onClick={() => navigate('/super-admin/clients')}
                    className="text-xs font-bold text-[#F8FAFC] bg-[#FF6B00] hover:bg-[#2563EB] transition-colors px-4 py-2 rounded-lg cursor-pointer"
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
