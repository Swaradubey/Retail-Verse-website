import { useState, useEffect, useCallback } from 'react';
import {
  vendorAllocationsApi,
  VendorLowStockAlertItem,
  VendorLowStockAlertsResponse,
} from '../api/vendorAllocations';

export interface UseVendorAlertsOptions {
  threshold?: number;
  refreshInterval?: number;
}

export interface UseVendorAlertsReturn {
  alerts: VendorLowStockAlertItem[];
  items: VendorLowStockAlertItem[];
  lowStockCount: number;
  outOfStockCount: number;
  totalAlertsCount: number;
  automaticLowStockCount: number;
  threshold: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Custom hook to fetch and subscribe to low-stock action alerts strictly assigned to the vendor.
 */
export function useVendorAlerts(
  vendorId?: string,
  options?: UseVendorAlertsOptions
): UseVendorAlertsReturn {
  const [data, setData] = useState<VendorLowStockAlertsResponse>({
    success: true,
    count: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    threshold: options?.threshold ?? 5,
    items: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await vendorAllocationsApi.getVendorLowStockProducts(
        vendorId,
        options?.threshold ?? 5
      );
      setData(res);
    } catch (err: any) {
      console.warn('[useVendorAlerts] Failed to fetch vendor replenishment alerts:', err);
      setError(err?.message || 'Failed to fetch vendor alerts');
    } finally {
      setLoading(false);
    }
  }, [vendorId, options?.threshold]);

  useEffect(() => {
    void fetchAlerts();
  }, [fetchAlerts]);

  // Optional periodic polling interval
  useEffect(() => {
    if (!options?.refreshInterval || options.refreshInterval <= 0) return;
    const interval = setInterval(() => {
      void fetchAlerts();
    }, options.refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAlerts, options?.refreshInterval]);

  const totalCount = data.count ?? (data.items?.length || 0);

  return {
    alerts: data.items || [],
    items: data.items || [],
    lowStockCount: data.lowStockCount ?? (data.items?.length || 0),
    outOfStockCount: data.outOfStockCount ?? 0,
    totalAlertsCount: totalCount,
    automaticLowStockCount: totalCount,
    threshold: data.threshold ?? 5,
    loading,
    error,
    refresh: fetchAlerts,
  };
}

export default useVendorAlerts;

