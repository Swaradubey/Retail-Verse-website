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

export type AllocationStatus = 'PENDING' | 'ACCEPTED' | 'DISPATCHED' | 'RECEIVED' | 'CANCELLED';

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

  /** Admin gets all allocations with read-receipt and progress information */
  async getAdminAllocations(params?: {
    status?: string;
    productId?: string;
    isSeen?: boolean;
  }): Promise<VendorAllocationItem[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.productId) query.set('productId', params.productId);
    if (params?.isSeen !== undefined) query.set('isSeen', String(params.isSeen));

    const qs = query.toString();
    const endpoint = `/vendor-allocations/admin${qs ? `?${qs}` : ''}`;
    const res = await ApiService.get<any>(endpoint);
    return extractAllocationList(res);
  },

  /** Low stock items requiring restock & pending allocation prompt */
  async getLowStockSummary(): Promise<LowStockSummaryItem[]> {
    const res = await ApiService.get<any>(
      '/vendor-allocations/low-stock-summary'
    );
    const raw = res?.items || res?.data?.items || (Array.isArray(res?.data) ? res.data : []) || (Array.isArray(res) ? res : []);
    return (raw as LowStockSummaryItem[]) || [];
  },

  /** Vendor views their allocated requirements */
  async getVendorAllocations(params?: {
    vendorId?: string;
    status?: string;
    isSeen?: boolean;
  }): Promise<{ allocations: VendorAllocationItem[]; vendor: VendorItem | null }> {
    const query = new URLSearchParams();
    if (params?.vendorId) query.set('vendorId', params.vendorId);
    if (params?.status) query.set('status', params.status);
    if (params?.isSeen !== undefined) query.set('isSeen', String(params.isSeen));

    const qs = query.toString();
    const endpoint = `/vendor/allocations${qs ? `?${qs}` : ''}`;
    try {
      const res = await ApiService.get<any>(endpoint);
      const rawList = extractAllocationList(res);
      const vendorObj = res?.vendor || res?.data?.vendor || null;

      return {
        allocations: rawList,
        vendor: vendorObj,
      };
    } catch {
      // Fallback to /vendor-allocations/vendor if needed
      const fallbackEndpoint = `/vendor-allocations/vendor${qs ? `?${qs}` : ''}`;
      const resFallback = await ApiService.get<any>(fallbackEndpoint);
      const rawList = extractAllocationList(resFallback);
      const vendorObj = resFallback?.vendor || resFallback?.data?.vendor || null;

      return {
        allocations: rawList,
        vendor: vendorObj,
      };
    }
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
};

export default vendorAllocationsApi;

