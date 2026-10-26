import ApiService from "./apiService";

export type ProductClientInfo = {
  _id?: string;
  companyName?: string;
  shopName?: string;
  email?: string;
};

export interface Product {
  _id?: string;
  name: string;
  title?: string;
  description?: string;
  price: number;
  originalPrice?: number;
  stock: number;
  category: string;
  image?: string;
  sku: string;
  barcode?: string;
  gst?: number;
  gstRate?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  isOnSale?: boolean;
  salePercentage?: number;
  rating?: number;
  numReviews?: number;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  clientId?: string;
  client?: ProductClientInfo | null;
}

// ── High Performance Stale-While-Revalidate Cache ──────────────────────────────
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryProductCache = new Map<string, CacheEntry<any>>();
const CLIENT_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const SESSION_CACHE_PREFIX = 'rv_prod_cache_';

function getFromSession<T>(key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setToSession<T>(key: string, entry: CacheEntry<T>): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded or private browsing
  }
}

export function getCachedProductData<T = any>(key: string): T | null {
  const mem = memoryProductCache.get(key);
  if (mem) return mem.data;
  const ses = getFromSession<T>(key);
  if (ses) {
    memoryProductCache.set(key, ses);
    return ses.data;
  }
  return null;
}

export function setCachedProductData<T = any>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  memoryProductCache.set(key, entry);
  setToSession(key, entry);
}

export const clearClientProductCache = () => {
  memoryProductCache.clear();
  if (typeof window !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(SESSION_CACHE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch {
      // ignore
    }
  }
};

export const inventoryApi = {
  getCachedManage: (): any | null => {
    return getCachedProductData('inventory_manage');
  },

  getManage: async (
    forceRefresh = false,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      category?: string;
      stockStatus?: string;
      minPrice?: number;
      maxPrice?: number;
      sort?: string;
      direction?: 'asc' | 'desc';
    }
  ): Promise<any> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.category && params.category !== 'All Categories') searchParams.set('category', params.category);
    if (params?.stockStatus && params.stockStatus !== 'all') searchParams.set('stockStatus', params.stockStatus);
    if (params?.minPrice) searchParams.set('minPrice', String(params.minPrice));
    if (params?.maxPrice !== undefined && params?.maxPrice < 999999) searchParams.set('maxPrice', String(params.maxPrice));
    if (params?.sort) searchParams.set('sort', params.sort);
    if (params?.direction) searchParams.set('direction', params.direction);

    const queryString = searchParams.toString();
    const key = `inventory_manage_${queryString || 'default'}`;
    const cached = memoryProductCache.get(key) || getFromSession(key);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp < CLIENT_CACHE_TTL_MS)) {
      return cached.data;
    }

    const url = queryString ? `/api/inventory/manage?${queryString}` : '/api/inventory/manage';
    const res = await ApiService.get<any>(url);
    if (res && res.success) {
      setCachedProductData(key, res);
      if (!queryString || params?.page === 1) {
        setCachedProductData('inventory_manage', res);
      }
    }
    return res;
  },

  prefetchManage: async () => {
    const key = 'inventory_manage';
    const cached = memoryProductCache.get(key) || getFromSession(key);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CLIENT_CACHE_TTL_MS)) return;
    try {
      const res = await ApiService.get<any>("/api/inventory/manage");
      if (res && res.success) {
        setCachedProductData(key, res);
      }
    } catch {
      // Background prefetch safe ignore
    }
  },

  create: (payload: Product) => {
    clearClientProductCache();
    return ApiService.post("/api/inventory", payload);
  },
  update: (id: string, payload: Partial<Product>) => {
    clearClientProductCache();
    return ApiService.put(`/api/inventory/${id}`, payload);
  },
  delete: (id: string) => {
    clearClientProductCache();
    return ApiService.delete(`/api/inventory/${id}`);
  },
};

export const productApi = {
  getCachedProducts: (clientId?: string, page = 1, limit = 50): any | null => {
    const cacheKey = `products_${clientId || 'global'}_p${page}_l${limit}`;
    return getCachedProductData(cacheKey);
  },

  getCachedFeatured: (clientId?: string): any | null => {
    const cacheKey = `featured_${clientId || 'global'}`;
    return getCachedProductData(cacheKey);
  },

  getAll: async (clientId?: string, forceRefresh = false, page = 1, limit = 50) => {
    const cacheKey = `products_${clientId || 'global'}_p${page}_l${limit}`;
    const cached = memoryProductCache.get(cacheKey) || getFromSession(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp < CLIENT_CACHE_TTL_MS)) {
      return cached.data;
    }

    const headers: Record<string, string> = {};
    if (clientId) {
      headers["x-client-id"] = clientId;
    }
    const params = new URLSearchParams();
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));
    const url = `/api/products?${params.toString()}`;

    const res = await ApiService.get<any>(url, { headers });
    if (res && res.success) {
      setCachedProductData(cacheKey, res);
    }
    return res;
  },

  prefetchProducts: async (clientId?: string, page = 1, limit = 50) => {
    const cacheKey = `products_${clientId || 'global'}_p${page}_l${limit}`;
    const cached = memoryProductCache.get(cacheKey) || getFromSession(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CLIENT_CACHE_TTL_MS)) return;
    try {
      const headers: Record<string, string> = {};
      if (clientId) headers["x-client-id"] = clientId;
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      const res = await ApiService.get<any>(`/api/products?${params.toString()}`, { headers });
      if (res && res.success) {
        setCachedProductData(cacheKey, res);
      }
    } catch {
      // Background prefetch ignore
    }
  },

  /** Scoped inventory list for dashboard (populates `client`; Super Admin sees all). */
  getManage: () => inventoryApi.getManage(),
  
  getOne: (id: string) => {
    return ApiService.get(`/api/products/${id}`);
  },

  getFeatured: async (clientId?: string, forceRefresh = false) => {
    const cacheKey = `featured_${clientId || 'global'}`;
    const cached = memoryProductCache.get(cacheKey) || getFromSession(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp < CLIENT_CACHE_TTL_MS)) {
      return cached.data;
    }

    const headers: Record<string, string> = {};
    if (clientId) {
      headers["x-client-id"] = clientId;
    }
    const res = await ApiService.get<any>("/api/products/featured", { headers });
    if (res && res.success) {
      setCachedProductData(cacheKey, res);
    }
    return res;
  },

  prefetchFeatured: async (clientId?: string) => {
    const cacheKey = `featured_${clientId || 'global'}`;
    const cached = memoryProductCache.get(cacheKey) || getFromSession(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CLIENT_CACHE_TTL_MS)) return;
    try {
      const headers: Record<string, string> = {};
      if (clientId) headers["x-client-id"] = clientId;
      const res = await ApiService.get<any>("/api/products/featured", { headers });
      if (res && res.success) {
        setCachedProductData(cacheKey, res);
      }
    } catch {
      // safe
    }
  },
  
  create: async (payload: Product) => {
    clearClientProductCache();
    return ApiService.post("/api/products", payload);
  },
  
  update: async (id: string, payload: Partial<Product>) => {
    clearClientProductCache();
    return ApiService.put(`/api/products/${id}`, payload);
  },
  
  delete: async (id: string) => {
    clearClientProductCache();
    return ApiService.delete(`/api/products/${id}`);
  },
  
  rate: async (id: string, rating: number) => {
    clearClientProductCache();
    return ApiService.post(`/api/products/${id}/rating`, { rating });
  },
};

export const catalogApi = {
  getCached: (): any | null => {
    return getCachedProductData('catalog_products');
  },

  getAll: async (forceRefresh = false): Promise<any> => {
    const key = 'catalog_products';
    const cached = memoryProductCache.get(key) || getFromSession(key);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp < CLIENT_CACHE_TTL_MS)) {
      return cached.data;
    }

    const res = await ApiService.get<any>("/api/products");
    if (res && res.success) {
      setCachedProductData(key, res);
    }
    return res;
  },

  prefetch: async () => {
    const key = 'catalog_products';
    const cached = memoryProductCache.get(key) || getFromSession(key);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CLIENT_CACHE_TTL_MS)) return;
    try {
      const res = await ApiService.get<any>("/api/products");
      if (res && res.success) {
        setCachedProductData(key, res);
      }
    } catch {
      // safe
    }
  },
};

/** Unified background prefetch helper for sidebar and routes */
export function prefetchProductsForRole(user?: any) {
  const role = user?.role ? String(user.role).toLowerCase() : 'user';
  const isUserRole = !user || role === 'user' || role === 'customer';
  const clientId = user?.clientId || user?.linkedClientId;

  if (isUserRole) {
    catalogApi.prefetch();
    productApi.prefetchProducts(clientId);
    productApi.prefetchFeatured(clientId);
  } else {
    inventoryApi.prefetchManage();
    catalogApi.prefetch();
    productApi.prefetchProducts(clientId);
  }
}

// Maintain compatibility with existing code that might import specific functions
export const getProducts = () => productApi.getAll();
export const createProduct = (data: Product) => productApi.create(data);
export const updateProduct = (id: string, data: Partial<Product>) => productApi.update(id, data);
export const deleteProduct = (id: string) => productApi.delete(id);
