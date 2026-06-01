export type InventoryClientInfo = {
  _id?: string;
  companyName?: string;
  shopName?: string;
  email?: string;
};

export interface InventoryItem {
  id: string;
  name: string;
  image: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  minStock?: number;
  lowStockThreshold?: number;
  updatedAt: string;
  client?: InventoryClientInfo | null;
}

export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock';

export interface InventoryFilters {
  search: string;
  stockStatus: StockStatus | 'all';
  category: string;
}

export interface SortConfig {
  key: 'stock' | 'price' | 'updatedAt' | 'name';
  direction: 'asc' | 'desc';
}
