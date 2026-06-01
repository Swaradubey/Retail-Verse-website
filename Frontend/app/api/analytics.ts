import ApiService from './apiService';

export interface AnalyticsSummary {
  /** Current calendar month — sum of order totalPrice (website + POS). */
  totalRevenue?: number;
  totalRevenueChange?: number;
  totalRevenueTrend?: 'up' | 'down' | 'neutral';
  /** Orders created in the current calendar month. */
  orderCount?: number;
  orderCountChange?: number;
  orderCountTrend?: 'up' | 'down' | 'neutral';
  /** Super Admin full analytics: distinct ordering identities (user or guest email) this calendar month. */
  activeCustomers?: number;
  activeCustomersChange?: number;
  activeCustomersTrend?: 'up' | 'down' | 'neutral';
  /** New storefront accounts (user/customer) registered this calendar month. */
  newCustomersThisMonth?: number;
  newCustomersChange?: number;
  newCustomersTrend?: 'up' | 'down' | 'neutral';
  conversionRate: number;
  conversionRateChange: number;
  conversionRateTrend: 'up' | 'down' | 'neutral';
  avgOrderValue: number;
  avgOrderValueChange: number;
  avgOrderValueTrend: 'up' | 'down' | 'neutral';
  customerLifetimeValue: number;
  customerLifetimeValueChange: number;
  customerLifetimeValueTrend: 'up' | 'down' | 'neutral';
  sessions: number;
  sessionsChange: number;
  sessionsTrend: 'up' | 'down' | 'neutral';
  /** Super Admin month KPIs (orders collection; see API meta notes). */
  salesThisMonth?: number;
  lossThisMonth?: number;
  profitThisMonth?: number;
  meta?: Record<string, string>;
}

export interface RevenueFlowPoint {
  name: string;
  sales: number;
  /** Order count for that day (when provided by API). */
  orders?: number;
  date?: string;
}

export interface TopCategoryPoint {
  name: string;
  value: number;
  percent: number;
  color: string;
}

export interface TopProductRow {
  name: string;
  sales: number;
  growthPercent: number;
  image: string;
}

export interface AdminAnalyticsData {
  /** `full` = Super Admin (conversion, CLV, sessions). `operational` = revenue/orders/products only. `user` = user specific analytics. */
  analyticsScope?: 'full' | 'operational' | 'user';
  summary: AnalyticsSummary;
  revenueFlow: RevenueFlowPoint[];
  topCategories: TopCategoryPoint[];
  topProducts: TopProductRow[];
  trialStats?: {
    totalTrialClients: number;
    activeTrials: number;
    expiredTrials: number;
    expiringSoon: number;
  };
}

export interface UserAnalyticsSummary {
  totalRevenue: number;
  totalRevenueChange: number;
  totalRevenueTrend: 'up' | 'down' | 'neutral';
  orderCount: number;
  orderCountChange: number;
  orderCountTrend: 'up' | 'down' | 'neutral';
  avgOrderValue: number;
  totalOrders: number;
  totalSpent: number;
}

export interface UserAnalyticsData {
  analyticsScope: 'user';
  summary: UserAnalyticsSummary;
  revenueFlow: RevenueFlowPoint[];
  topCategories: TopCategoryPoint[];
  periods: {
    summaryMonth: { start: string; end: string };
    previousMonth: { start: string; end: string };
  };
}

export async function fetchAdminAnalytics(options?: any): Promise<AdminAnalyticsData> {
  const res = await ApiService.get<AdminAnalyticsData>('/admin/analytics', options);
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Failed to load analytics');
  }
  console.log("fetchAdminAnalytics raw response:", res.data);
  return res.data as AdminAnalyticsData;
}

export async function fetchSuperAdminOverview(options?: any): Promise<AdminAnalyticsData> {
  const res = await ApiService.get<any>('/superadmin/overview', options);
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Failed to load super admin overview');
  }
  const d = res.data;

  console.log("fetchSuperAdminOverview raw response:", d);

  // Map the new backend format to the existing AdminAnalyticsData interface
  // to keep the frontend components working without changes
  const mappedData: AdminAnalyticsData = {
    analyticsScope: 'full',
    summary: {
      totalRevenue: d.totalRevenue,
      totalRevenueChange: d.totalRevenueChange || 0,
      totalRevenueTrend: d.totalRevenueTrend || 'neutral',
      activeCustomers: d.activeCustomers,
      activeCustomersChange: d.activeCustomersChange || 0,
      activeCustomersTrend: d.activeCustomersTrend || 'neutral',
      newCustomersThisMonth: d.newCustomers,
      newCustomersChange: d.newCustomersChange || 0,
      newCustomersTrend: d.newCustomersTrend || 'neutral',
      conversionRate: d.conversionRate,
      conversionRateChange: d.conversionRateChange || 0,
      conversionRateTrend: d.conversionRateTrend || 'neutral',
      orderCount: d.totalOrdersThisMonth,
      orderCountChange: d.totalOrdersThisMonthChange || 0,
      orderCountTrend: d.totalOrdersThisMonthTrend || 'neutral',
      avgOrderValue: d.avgOrderValue != null ? d.avgOrderValue : (d.totalOrdersThisMonth > 0 ? d.totalRevenue / d.totalOrdersThisMonth : 0),
      avgOrderValueChange: d.avgOrderValueChange || 0,
      avgOrderValueTrend: d.avgOrderValueTrend || 'neutral',
      customerLifetimeValue: d.activeCustomers > 0 ? d.totalRevenue / d.activeCustomers : 0,
      customerLifetimeValueChange: 0,
      customerLifetimeValueTrend: 'neutral',
      sessions: d.liveCustomers || 0,
      sessionsChange: 0,
      sessionsTrend: 'neutral',
      salesThisMonth: d.salesThisMonth,
      lossThisMonth: d.lossThisMonth,
      profitThisMonth: d.profitThisMonth,
    },
    revenueFlow: (d.salesAnalytics || []).map((s: any) => ({
      name: new Date(s.date).toLocaleDateString('en-US', { weekday: 'short' }),
      date: s.date,
      sales: s.revenue,
      orders: s.orders
    })).reverse(),
    topCategories: (d.categoryDistribution || []).map((c: any, idx: number) => ({
      name: c.category,
      value: c.totalSales,
      percent: c.totalSales > 0 ? (c.totalSales / d.salesThisMonth) * 100 : 0,
      color: ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e'][idx % 7] || '#3b82f6'
    })),
    topProducts: d.topProducts || [],
    trialStats: d.trialStats,
  };

  // Fix percent if salesThisMonth is 0
  const catTotal = mappedData.topCategories.reduce((acc, curr) => acc + curr.value, 0);
  if (catTotal > 0) {
    mappedData.topCategories.forEach(c => c.percent = (c.value / catTotal) * 100);
  }

  console.log("fetchSuperAdminOverview mapped:", mappedData);

  return mappedData;
}

export async function fetchUserAnalytics(options?: any): Promise<UserAnalyticsData> {
  const res = await ApiService.get<UserAnalyticsData>('/user/analytics', options);
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Failed to load user analytics');
  }
  return res.data as UserAnalyticsData;
}
