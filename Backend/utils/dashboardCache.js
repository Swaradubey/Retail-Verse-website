/**
 * In-memory high-performance TTL cache for Dashboard Metrics & Overview
 * Handles instant cache invalidation on Order/Invoice/Quote deletions or modifications.
 */

const adminAnalyticsCache = new Map();
const superAdminOverviewCache = new Map();
const ordersCache = new Map();
const ADMIN_ANALYTICS_CACHE_TTL = 60 * 1000;
const SUPERADMIN_CACHE_TTL = 60 * 1000;
const ORDERS_CACHE_TTL = 30 * 1000;

function getCachedAdminAnalytics(key) {
  const item = adminAnalyticsCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    adminAnalyticsCache.delete(key);
    return null;
  }
  return item.data;
}

function setCachedAdminAnalytics(key, data, ttlMs = ADMIN_ANALYTICS_CACHE_TTL) {
  if (adminAnalyticsCache.size > 200) {
    const oldestKey = adminAnalyticsCache.keys().next().value;
    if (oldestKey) adminAnalyticsCache.delete(oldestKey);
  }
  adminAnalyticsCache.set(key, {
    data,
    expiry: Date.now() + ttlMs,
  });
}

function getCachedSuperAdminOverview(key) {
  const item = superAdminOverviewCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    superAdminOverviewCache.delete(key);
    return null;
  }
  return item.data;
}

function setCachedSuperAdminOverview(key, data, ttlMs = SUPERADMIN_CACHE_TTL) {
  if (superAdminOverviewCache.size > 200) {
    const oldestKey = superAdminOverviewCache.keys().next().value;
    if (oldestKey) superAdminOverviewCache.delete(oldestKey);
  }
  superAdminOverviewCache.set(key, {
    data,
    expiry: Date.now() + ttlMs,
  });
}

function getCachedOrders(key) {
  const item = ordersCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    ordersCache.delete(key);
    return null;
  }
  return item.data;
}

function setCachedOrders(key, data, ttlMs = ORDERS_CACHE_TTL) {
  if (ordersCache.size > 200) {
    const oldestKey = ordersCache.keys().next().value;
    if (oldestKey) ordersCache.delete(oldestKey);
  }
  ordersCache.set(key, {
    data,
    expiry: Date.now() + ttlMs,
  });
}

function invalidateOrdersCache() {
  const size = ordersCache.size;
  ordersCache.clear();
  if (size > 0) {
    console.log(`[DashboardCache] Invalidated orders cache (${size} keys cleared)`);
  }
}

/**
 * Instantly invalidates all dashboard metric and order caches
 */
function invalidateDashboardCache() {
  const adminSize = adminAnalyticsCache.size;
  const saSize = superAdminOverviewCache.size;
  const ordersSize = ordersCache.size;
  adminAnalyticsCache.clear();
  superAdminOverviewCache.clear();
  ordersCache.clear();
  console.log(`[DashboardCache] Invalidated dashboard caches (${adminSize} admin, ${saSize} superadmin, ${ordersSize} orders cleared)`);
}

module.exports = {
  getCachedAdminAnalytics,
  setCachedAdminAnalytics,
  getCachedSuperAdminOverview,
  setCachedSuperAdminOverview,
  getCachedOrders,
  setCachedOrders,
  invalidateOrdersCache,
  invalidateDashboardCache,
  adminAnalyticsCache,
  superAdminOverviewCache,
  ordersCache,
};

