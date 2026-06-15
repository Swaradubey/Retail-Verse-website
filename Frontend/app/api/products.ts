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

export const productApi = {
  getAll: (clientId?: string) => {
    const headers: Record<string, string> = {};
    if (clientId) {
      headers["x-client-id"] = clientId;
    }
    return ApiService.get("/api/products", { headers });
  },

  /** Scoped inventory list for dashboard (populates `client`; Super Admin sees all). */
  getManage: () => inventoryApi.getManage(),
  
  getOne: (id: string) => {
    return ApiService.get(`/api/products/${id}`);
  },

  getFeatured: (clientId?: string) => {
    const headers: Record<string, string> = {};
    if (clientId) {
      headers["x-client-id"] = clientId;
    }
    return ApiService.get("/api/products/featured", { headers });
  },
  
  create: (payload: Product) => {
    return ApiService.post("/api/products", payload);
  },
  
  update: (id: string, payload: Partial<Product>) => {
    return ApiService.put(`/api/products/${id}`, payload);
  },
  
  delete: (id: string) => {
    return ApiService.delete(`/api/products/${id}`);
  },
  
  rate: (id: string, rating: number) => {
    return ApiService.post(`/api/products/${id}/rating`, { rating });
  },
};

// Maintain compatibility with existing code that might import specific functions
export const getProducts = () => productApi.getAll();
export const createProduct = (data: Product) => productApi.create(data);
export const updateProduct = (id: string, data: Partial<Product>) => productApi.update(id, data);
export const deleteProduct = (id: string) => productApi.delete(id);
