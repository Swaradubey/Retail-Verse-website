import ApiService from './apiService';

export interface VendorItem {
  _id: string;
  name: string;
  companyName?: string;
  email: string;
  phone?: string;
  address?: string;
  category?: string;
  contactPerson?: string;
  isActive: boolean;
}

export type AllocationStatus =
  | 'PENDING'
  | 'PENDING_ACCEPTANCE'
  | 'PUBLISHED'
  | 'ACCEPTED'
  | 'DISPATCHED'
  | 'RECEIVED'
  | 'CANCELLED';

export interface AllocatedProduct {
  _id: string;
  name: string;
  sku: string;
  category?: string;
  image?: string;
  imageUrl?: string;
  images?: string[];
  price?: number;
  stock: number;
  stockLevel?: number;
  currentStock?: number;
  threshold?: number;
  lowStockAlert?: number;
  lowStockThreshold?: number;
  minStock?: number;
}

export interface AllocatedVendor {
  _id: string;
  name: string;
  companyName?: string;
  email: string;
  phone?: string;
  address?: string;
}

export interface VendorAllocationItem {
  _id: string;
  productId: AllocatedProduct;
  vendorId: AllocatedVendor;
  adminId?: {
    _id: string;
    name: string;
    email: string;
  };
  allocatedQuantity: number;
  currentStockAtTrigger: number;
  targetDeliveryDate?: string | null;
  status: AllocationStatus;
  isSeen: boolean;
  seenAt?: string | null;
  vendorNotes?: string;
  dispatchedAt?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface AdminAllocationMetrics {
  total: number;
  inTransit: number;
  unread: number;
  received: number;
  totalUnits: number;
}

export interface AdminAllocationsResponse {
  success: boolean;
  data: VendorAllocationItem[];
  allocations: VendorAllocationItem[];
  count: number;
  pagination: PaginationInfo;
  metrics: AdminAllocationMetrics;
}

export interface VendorAllocationsResponse {
  success: boolean;
  data: VendorAllocationItem[];
  allocations: VendorAllocationItem[];
  vendor: VendorItem | null;
  count: number;
  pagination: PaginationInfo;
  metrics: VendorStats;
  stats: VendorStats;
}

export interface SplitAllocationPayload {
  productId: string;
  allocations: Array<{
    vendorId: string;
    allocatedQuantity: number;
    targetDeliveryDate?: string | null;
    notes?: string;
  }>;
}

export interface LowStockSummaryItem extends AllocatedProduct {
  threshold: number;
  activeAllocationsCount: number;
  totalUnitsAllocated: number;
  suggestedReplenishment: number;
  allocations: VendorAllocationItem[];
}

export interface VendorLowStockAlertItem extends AllocatedProduct {
  totalUnitsAllocated?: number;
  activeAllocationCount?: number;
  allocations?: VendorAllocationItem[];
  latestAllocation?: VendorAllocationItem | null;
}

export interface VendorLowStockAlertsResponse {
  success: boolean;
  count: number;
  lowStockCount: number;
  outOfStockCount: number;
  threshold: number;
  items: VendorLowStockAlertItem[];
  data?: VendorLowStockAlertItem[];
}

export interface VendorStats {
  totalAllocations: number;
  pending: number;
  accepted: number;
  dispatched: number;
  received: number;
  totalUnitsAllocated: number;
  seenCount: number;
  unseenCount: number;
}

function extractVendorList(res: any): VendorItem[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.vendors)) return res.vendors;
  if (Array.isArray(res.data)) return res.data;
  if (res.data && Array.isArray(res.data.vendors)) return res.data.vendors;
  if (res.data && Array.isArray(res.data.data)) return res.data.data;
  if (Array.isArray(res.items)) return res.items;
  if (Array.isArray(res.users)) return res.users;
  return [];
}

function extractAllocationList(res: any): VendorAllocationItem[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.allocations)) return res.allocations;
  if (Array.isArray(res.data)) return res.data;
  if (res.data && Array.isArray(res.data.allocations)) return res.data.allocations;
  if (res.data && Array.isArray(res.data.data)) return res.data.data;
  return [];
}

function extractPagination(res: any, defaultLimit = 10): PaginationInfo {
  const p = res?.pagination || res?.data?.pagination;
  const list = extractAllocationList(res);
  const total =
    typeof p?.total === 'number'
      ? p.total
      : typeof res?.count === 'number'
      ? res.count
      : list.length;
  const page = typeof p?.page === 'number' ? p.page : 1;
  const limit = typeof p?.limit === 'number' ? p.limit : defaultLimit;
  const totalPages =
    typeof p?.totalPages === 'number' ? p.totalPages : Math.ceil(total / limit) || 1;
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: p?.hasNextPage !== undefined ? p.hasNextPage : page < totalPages,
    hasPrevPage: p?.hasPrevPage !== undefined ? p.hasPrevPage : page > 1,
  };
}

function extractAdminMetrics(res: any): AdminAllocationMetrics {
  const m = res?.metrics || res?.data?.metrics;
  if (m) {
    return {
      total: Number(m.total) || 0,
      inTransit: Number(m.inTransit) || 0,
      unread: Number(m.unread) || 0,
      received: Number(m.received) || 0,
      totalUnits: Number(m.totalUnits) || 0,
    };
  }
  const list = extractAllocationList(res);
  return {
    total: list.length,
    inTransit: list.filter((a) => a.status === 'DISPATCHED').length,
    unread: list.filter((a) => !a.isSeen && a.status !== 'RECEIVED').length,
    received: list.filter((a) => a.status === 'RECEIVED').length,
    totalUnits: list.reduce((sum, a) => sum + (Number(a.allocatedQuantity) || 0), 0),
  };
}

function extractVendorMetrics(res: any): VendorStats {
  const m = res?.metrics || res?.stats || res?.data?.metrics || res?.data?.stats;
  if (m) {
    return {
      totalAllocations: Number(m.totalAllocations) || 0,
      totalUnits: Number(m.totalUnits) || 0,
      pending: Number(m.pending) || 0,
      accepted: Number(m.accepted) || 0,
      dispatched: Number(m.dispatched) || 0,
      received: Number(m.received) || 0,
      seenCount: Number(m.seenCount) || 0,
      unseenCount: Number(m.unseenCount ?? m.unreadCount) || 0,
    };
  }
  const list = extractAllocationList(res);
  return {
    totalAllocations: list.length,
    totalUnits: list.reduce((sum, a) => sum + (Number(a.allocatedQuantity) || 0), 0),
    pending: list.filter(
      (a) =>
        a.status === 'PENDING' ||
        a.status === 'PENDING_ACCEPTANCE' ||
        a.status === 'PUBLISHED'
    ).length,
    accepted: list.filter((a) => a.status === 'ACCEPTED').length,
    dispatched: list.filter((a) => a.status === 'DISPATCHED').length,
    received: list.filter((a) => a.status === 'RECEIVED').length,
    seenCount: list.filter((a) => a.isSeen).length,
    unseenCount: list.filter((a) => !a.isSeen).length,
  };
}

export const vendorAllocationsApi = {
  /** Fetch active vendors from /admin/vendors or vendor endpoints */
  async getVendors(): Promise<VendorItem[]> {
    const endpoints = [
      '/admin/vendors',
      '/vendor-allocations/vendors',
      '/vendors',
      '/vendor/vendors',
    ];

    for (const ep of endpoints) {
      try {
        const res = await ApiService.get<any>(ep);
        const list = extractVendorList(res);
        if (list && list.length > 0) {
          return list;
        }
      } catch {
        // Fallback to next endpoint
      }
    }

    return [];
  },

  /** Create a new vendor */
  async createVendor(data: {
    name: string;
    companyName?: string;
    email: string;
    phone?: string;
    address?: string;
    category?: string;
    contactPerson?: string;
  }): Promise<VendorItem> {
    const res = await ApiService.post<{ vendor: VendorItem }>('/vendor-allocations/vendors', data);
    return res.data?.vendor as VendorItem;
  },

  /** Admin creates multi-vendor split allocation */
  async createSplitAllocation(payload: SplitAllocationPayload): Promise<VendorAllocationItem[]> {
    const res = await ApiService.post<{ allocations: VendorAllocationItem[] }>(
      '/vendor-allocations/allocate',
      payload
    );
    return res.data?.allocations || [];
  },

  /** Admin gets allocations with server-side pagination, search, read-receipt, and delivery metrics */
  async getAdminAllocations(params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    productId?: string;
    isSeen?: boolean;
  }): Promise<AdminAllocationsResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.search) query.set('search', params.search.trim());
    if (params?.productId) query.set('productId', params.productId);
    if (params?.isSeen !== undefined) query.set('isSeen', String(params.isSeen));

    const qs = query.toString();
    const endpoint = `/vendor-allocations/admin${qs ? `?${qs}` : ''}`;
    const res = await ApiService.get<any>(endpoint);
    const list = extractAllocationList(res);
    const pagination = extractPagination(res, params?.limit || 10);
    const metrics = extractAdminMetrics(res);

    return {
      success: true,
      data: list,
      allocations: list,
      count: pagination.total,
      pagination,
      metrics,
    };
  },

  /** Low stock items requiring restock & pending allocation prompt */
  async getLowStockSummary(): Promise<LowStockSummaryItem[]> {
    const res = await ApiService.get<any>(
      '/vendor-allocations/low-stock-summary'
    );
    const raw = res?.items || res?.data?.items || (Array.isArray(res?.data) ? res.data : []) || (Array.isArray(res) ? res : []);
    return (raw as LowStockSummaryItem[]) || [];
  },

  /** Vendor views their allocated requirements with server-side pagination (limit=10) and metrics */
  async getVendorAllocations(params?: {
    vendorId?: string;
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    isSeen?: boolean;
  }): Promise<VendorAllocationsResponse> {
    const query = new URLSearchParams();
    if (params?.vendorId) query.set('vendorId', params.vendorId);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.search) query.set('search', params.search.trim());
    if (params?.isSeen !== undefined) query.set('isSeen', String(params.isSeen));

    const qs = query.toString();
    const endpoint = `/vendor/allocations${qs ? `?${qs}` : ''}`;
    let rawRes: any;
    try {
      rawRes = await ApiService.get<any>(endpoint);
    } catch {
      // Fallback to /vendor-allocations/vendor if needed
      const fallbackEndpoint = `/vendor-allocations/vendor${qs ? `?${qs}` : ''}`;
      rawRes = await ApiService.get<any>(fallbackEndpoint);
    }

    const list = extractAllocationList(rawRes);
    const vendorObj = rawRes?.vendor || rawRes?.data?.vendor || null;
    const pagination = extractPagination(rawRes, params?.limit || 10);
    const metrics = extractVendorMetrics(rawRes);

    return {
      success: true,
      data: list,
      allocations: list,
      vendor: vendorObj,
      count: pagination.total,
      pagination,
      metrics,
      stats: metrics,
    };
  },

  /** Vendor opens/views requirement - updates read-receipt (Seen feature) */
  async markAllocationSeen(id: string, vendorId?: string): Promise<VendorAllocationItem> {
    const query = vendorId ? `?vendorId=${vendorId}` : '';
    try {
      const res = await ApiService.patch<{ allocation?: VendorAllocationItem; data?: VendorAllocationItem }>(
        `/vendor/allocations/${id}/seen${query}`,
        {}
      );
      return (res.data?.allocation || res.data?.data) as VendorAllocationItem;
    } catch {
      const resFallback = await ApiService.post<{
        allocation?: VendorAllocationItem;
        data?: VendorAllocationItem;
      }>(`/vendor-allocations/${id}/seen${query}`, {});
      return (resFallback.data?.allocation || resFallback.data?.data) as VendorAllocationItem;
    }
  },

  /** Vendor updates status: ACCEPTED or DISPATCHED */
  async updateVendorStatus(
    id: string,
    data: { status: 'ACCEPTED' | 'DISPATCHED'; vendorNotes?: string },
    vendorId?: string
  ): Promise<VendorAllocationItem> {
    const query = vendorId ? `?vendorId=${vendorId}` : '';
    try {
      const res = await ApiService.patch<{ allocation?: VendorAllocationItem; data?: VendorAllocationItem }>(
        `/vendor/allocations/${id}/status${query}`,
        data
      );
      return (res.data?.allocation || res.data?.data) as VendorAllocationItem;
    } catch {
      const resFallback = await ApiService.post<{
        allocation?: VendorAllocationItem;
        data?: VendorAllocationItem;
      }>(`/vendor-allocations/${id}/status${query}`, data);
      return (resFallback.data?.allocation || resFallback.data?.data) as VendorAllocationItem;
    }
  },

  /** Vendor directly updates stock in inventory for their allocated quantity */
  async updateVendorStock(
    id: string,
    data?: { quantity?: number; vendorNotes?: string },
    vendorId?: string
  ): Promise<{ allocation: VendorAllocationItem; newStock: number; message?: string }> {
    const query = vendorId ? `?vendorId=${vendorId}` : '';
    const res = await ApiService.post<any>(
      `/vendor/allocations/${id}/update-stock${query}`,
      data || {}
    );
    const alloc = res?.allocation || res?.data?.allocation || res?.data || res;
    return {
      allocation: alloc as VendorAllocationItem,
      newStock: res?.newStock ?? alloc?.productId?.stock,
      message: res?.message,
    };
  },

  /** Vendor marks allocation as Dispatched / In Transit */
  async dispatchAllocation(
    id: string,
    notes?: string,
    vendorId?: string
  ): Promise<VendorAllocationItem> {
    const res = await this.updateVendorStock(id, { vendorNotes: notes }, vendorId);
    return res.allocation;
  },

  /** Admin confirms receipt, automatically incrementing product stock */
  async receiveAllocation(id: string): Promise<{ allocation: VendorAllocationItem; newStock?: number }> {
    const res = await ApiService.post<{ allocation: VendorAllocationItem; newStock: number }>(
      `/vendor-allocations/${id}/receive`,
      {}
    );
    return {
      allocation: res.data?.allocation as VendorAllocationItem,
      newStock: res.data?.newStock,
    };
  },

  /** Admin cancels an allocation */
  async cancelAllocation(id: string): Promise<VendorAllocationItem> {
    const res = await ApiService.post<{ allocation: VendorAllocationItem }>(
      `/vendor-allocations/${id}/cancel`,
      {}
    );
    return res.data?.allocation as VendorAllocationItem;
  },

  /** Delete an allocation */
  async deleteAllocation(id: string): Promise<boolean> {
    await ApiService.delete(`/vendor-allocations/${id}`);
    return true;
  },

  /** Vendor KPI metrics */
  async getVendorStats(vendorId?: string): Promise<{ stats: VendorStats; vendor: VendorItem | null }> {
    const query = vendorId ? `?vendorId=${vendorId}` : '';
    const res = await ApiService.get<{ stats: VendorStats; vendor: VendorItem }>(
      `/vendor-allocations/vendor/stats${query}`
    );
    return {
      stats: res.data?.stats || {
        totalAllocations: 0,
        pending: 0,
        accepted: 0,
        dispatched: 0,
        received: 0,
        totalUnitsAllocated: 0,
        seenCount: 0,
        unseenCount: 0,
      },
      vendor: res.data?.vendor || null,
    };
  },

  /** Fetch real-time low-stock alerts strictly for products allocated/assigned to this vendor */
  async getVendorLowStockAlerts(
    vendorId?: string,
    threshold: number = 5
  ): Promise<VendorLowStockAlertsResponse> {
    const params = new URLSearchParams();
    if (vendorId) params.append('vendorId', vendorId);
    if (threshold) params.append('threshold', String(threshold));
    const query = params.toString() ? `?${params.toString()}` : '';

    let raw: any;
    try {
      raw = await ApiService.get(`/vendor/low-stock-products${query}`);
    } catch {
      try {
        raw = await ApiService.get(`/vendor/low-stock-alerts${query}`);
      } catch {
        try {
          raw = await ApiService.get(`/vendor-allocations/low-stock-alerts${query}`);
        } catch {
          raw = null;
        }
      }
    }

    const items: VendorLowStockAlertItem[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
      ? raw.items
      : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.products)
      ? raw.products
      : [];

    const totalCount =
      typeof raw?.count === 'number'
        ? raw.count
        : typeof raw?.lowStockCount === 'number'
        ? raw.lowStockCount
        : items.length;

    return {
      success: true,
      count: totalCount,
      lowStockCount: totalCount,
      outOfStockCount: typeof raw?.outOfStockCount === 'number' ? raw.outOfStockCount : 0,
      threshold: typeof raw?.threshold === 'number' ? raw.threshold : threshold,
      items,
      data: items,
    };
  },

  /** Fetch real-time low-stock products mapped to authenticated vendor */
  async getVendorLowStockProducts(
    vendorId?: string,
    threshold: number = 5
  ): Promise<VendorLowStockAlertsResponse> {
    return this.getVendorLowStockAlerts(vendorId, threshold);
  },
};

export default vendorAllocationsApi;

