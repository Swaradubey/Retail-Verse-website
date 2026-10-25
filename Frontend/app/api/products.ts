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

export const inventoryApi = {
  getManage: () => ApiService.get<Product[]>("/api/inventory/manage"),
  create: (payload: Product) => ApiService.post("/api/inventory", payload),
  update: (id: string, payload: Partial<Product>) => ApiService.put(`/api/inventory/${id}`, payload),
  delete: (id: string) => ApiService.delete(`/api/inventory/${id}`),
};

// In-memory cache for instant client-side navigation without network delay
const clientProductCache = new Map<string, { data: any; timestamp: number }>();
const CLIENT_CACHE_TTL_MS = 30 * 1000; // 30 seconds

export const clearClientProductCache = () => {
  clientProductCache.clear();
};

export const productApi = {
  getAll: async (clientId?: string, forceRefresh = false) => {
    const cacheKey = `products_${clientId || 'global'}`;
    const cached = clientProductCache.get(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp < CLIENT_CACHE_TTL_MS)) {
      return cached.data;
    }

    const headers: Record<string, string> = {};
    if (clientId) {
      headers["x-client-id"] = clientId;
    }
    const res = await ApiService.get("/api/products", { headers });
    if (res && res.success) {
      clientProductCache.set(cacheKey, { data: res, timestamp: Date.now() });
    }
    return res;
  },

  /** Scoped inventory list for dashboard (populates `client`; Super Admin sees all). */
  getManage: () => inventoryApi.getManage(),
  
  getOne: (id: string) => {
    return ApiService.get(`/api/products/${id}`);
  },

  getFeatured: async (clientId?: string, forceRefresh = false) => {
    const cacheKey = `featured_${clientId || 'global'}`;
    const cached = clientProductCache.get(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp < CLIENT_CACHE_TTL_MS)) {
      return cached.data;
    }

    const headers: Record<string, string> = {};
    if (clientId) {
      headers["x-client-id"] = clientId;
    }
    const res = await ApiService.get("/api/products/featured", { headers });
    if (res && res.success) {
      clientProductCache.set(cacheKey, { data: res, timestamp: Date.now() });
    }
    return res;
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
  getAll: () => ApiService.get<Product[]>("/api/products"),
};

// Maintain compatibility with existing code that might import specific functions
export const getProducts = () => productApi.getAll();
export const createProduct = (data: Product) => productApi.create(data);
export const updateProduct = (id: string, data: Partial<Product>) => productApi.update(id, data);
export const deleteProduct = (id: string) => productApi.delete(id);
