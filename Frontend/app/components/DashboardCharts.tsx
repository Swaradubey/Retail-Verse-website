import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import type { AdminAnalyticsData, UserAnalyticsData } from '../api/analytics';

const FALLBACK_SALES = [
  { name: '—', revenue: 0, orders: 0 },
];

const PALETTE_COLORS = ['#FF6B00', '#2563EB', '#0B1F3A'];
const FALLBACK_PIE = [{ name: 'No data', value: 1, color: '#0B1F3A' }];

const REVENUE_LINE = '#FF6B00';
const ORDERS_LINE = '#2563EB';

type TooltipEntry = {
  dataKey?: string | number;
  value?: unknown;
  color?: string;
  name?: string;
};

function formatTooltipNumber(entry: TooltipEntry, _revenueInInr?: boolean): string {
  const raw = entry.value;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (typeof raw !== 'number' && Number.isNaN(n)) return String(raw ?? '');
  const isRevenue =
    entry.dataKey === 'revenue' || entry.name === 'Revenue' || String(entry.dataKey) === 'revenue';
  if (isRevenue) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }
  return n.toLocaleString();
}

function ChartTooltip({
  active,
  payload,
  label,
  revenueInInr,
}: {
  active?: boolean;
  payload?: TooltipEntry[] | readonly TooltipEntry[];
  label?: string | number;
  revenueInInr?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const inr = !!revenueInInr;
  return (
    <div className="rounded-xl border border-[#0B1F3A] bg-[#F8FAFC] text-[#0B1F3A] px-3.5 py-2.5 shadow-lg">
      {label != null && label !== '' && (
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[#0B1F3A]/70">{String(label)}</p>
      )}
      <ul className="space-y-1">
        {[...payload].map((entry, i) => (
          <li key={`${String(entry.dataKey)}-${i}`} className="flex items-center gap-2 text-sm font-semibold tabular-nums">
            {entry.color ? (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            ) : null}
            <span className="text-[#0B1F3A]/80 font-medium">{entry.name != null ? String(entry.name) : ''}:</span>
            <span className="text-[#0B1F3A] font-bold">{formatTooltipNumber(entry, inr)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const chartCardClass =
  'h-full overflow-hidden rounded-[1.125rem] border border-[#0B1F3A]/20 bg-[#F8FAFC] shadow-md transition-all duration-300 ease-out hover:border-[#2563EB] hover:shadow-lg';

type DashboardChartsProps = {
  analytics: AdminAnalyticsData | UserAnalyticsData | null;
  staffView: boolean;
  /** Super Admin overview: show revenue in ₹ in chart tooltips */
  revenueInInr?: boolean;
};

export function DashboardCharts({ analytics, staffView, revenueInInr }: DashboardChartsProps) {
  const isUserAnalytics = analytics?.analyticsScope === 'user';
  
  const salesData = useMemo(() => {
    if ((!staffView && !isUserAnalytics) || !analytics?.revenueFlow?.length) {
      return FALLBACK_SALES;
    }
    return analytics.revenueFlow.map((d) => ({
      name: d.name,
      revenue: Math.round(d.sales * 100) / 100,
      orders: typeof d.orders === 'number' ? d.orders : 0,
    }));
  }, [analytics, staffView, isUserAnalytics]);

  const categoryData = useMemo(() => {
    if ((!staffView && !isUserAnalytics) || !analytics?.topCategories?.length) {
      return FALLBACK_PIE;
    }
    return analytics.topCategories.map((c, index) => ({
      name: c.name,
      value: Math.max(0, c.value),
      color: PALETTE_COLORS[index % PALETTE_COLORS.length],
    }));
  }, [analytics, staffView, isUserAnalytics]);

  const hasLiveLine = (staffView || isUserAnalytics) && analytics?.revenueFlow && analytics.revenueFlow.length > 0;
  const hasLivePie =
    (staffView || isUserAnalytics) &&
    analytics?.topCategories &&
    analytics.topCategories.length > 0 &&
    categoryData.some((c) => c.value > 0);

  return (
    <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-7 mt-2">
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="col-span-1 lg:col-span-4"
      >
        <Card className={chartCardClass}>
          <CardHeader className="space-y-1 pb-2 pt-6 px-6">
            <CardTitle className="text-lg font-bold tracking-tight text-[#0B1F3A]">
              Sales Analytics
            </CardTitle>
            <CardDescription className="text-sm text-[#0B1F3A]/70 leading-relaxed">
              {hasLiveLine ? 'Revenue and orders — last 7 days (live).' : 'Revenue and order performance over time.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[320px] sm:h-[350px] px-4 pb-6 sm:px-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#0B1F3A" strokeOpacity={0.1} />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#0B1F3A', fontSize: 12 }}
                  dy={6}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#0B1F3A', fontSize: 12 }}
                  width={44}
                />
                <Tooltip
                  content={(props) => (
                    <ChartTooltip
                      active={props.active}
                      payload={props.payload as TooltipEntry[] | undefined}
                      label={props.label as string | number | undefined}
                      revenueInInr={revenueInInr}
                    />
                  )}
                />
                <Legend
                  wrapperStyle={{ paddingTop: 16 }}
                  formatter={(value) => <span className="text-sm font-medium text-[#0B1F3A]">{value}</span>}
                />
                <Line
                  type="natural"
                  name="Revenue"
                  dataKey="revenue"
                  stroke={REVENUE_LINE}
                  strokeWidth={2.75}
                  dot={{ r: 4, fill: REVENUE_LINE, strokeWidth: 2, stroke: '#F8FAFC' }}
                  activeDot={{ r: 7, strokeWidth: 0, fill: REVENUE_LINE }}
                />
                <Line
                  type="natural"
                  name="Orders"
                  dataKey="orders"
                  stroke={ORDERS_LINE}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: ORDERS_LINE, strokeWidth: 2, stroke: '#F8FAFC' }}
                  activeDot={{ r: 6, strokeWidth: 0, fill: ORDERS_LINE }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
        className="col-span-1 lg:col-span-3"
      >
        <Card className={chartCardClass}>
          <CardHeader className="space-y-1 pb-2 pt-6 px-6">
            <CardTitle className="text-lg font-bold tracking-tight text-[#0B1F3A]">
              Category Distribution
            </CardTitle>
            <CardDescription className="text-sm text-[#0B1F3A]/70 leading-relaxed">
              {hasLivePie ? 'Sales share by product category (this month).' : 'Sales share by product category.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pt-0 pb-6 px-4 sm:px-6 h-[320px] sm:h-[350px]">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={86}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="#F8FAFC"
                  strokeWidth={2}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={(props) => (
                    <ChartTooltip
                      active={props.active}
                      payload={props.payload as TooltipEntry[] | undefined}
                      label={props.label as string | number | undefined}
                      revenueInInr={revenueInInr}
                    />
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-2 w-full max-w-sm px-2">
              {categoryData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[#0B1F3A]/20"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs font-semibold text-[#0B1F3A]/80 truncate">{entry.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
