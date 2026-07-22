export type InventoryClientInfo = {
  _id?: string;
  companyName?: string;
  shopName?: string;
  email?: string;
};

export type MarketplaceSyncStatus =
  | 'not_connected'
  | 'not_synced'
  | 'queued'
  | 'processing'
  | 'synced'
  | 'failed';

export interface MarketplaceInfo {
  provider: string;
  connectionId: string;
  accountName: string;
  status: MarketplaceSyncStatus;
  externalProductId?: string | null;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  inventoryItemId?: string | null;
  lastSyncedAt?: string | null;
}

export interface MarketplaceListing {
  _id: string;
  marketplace: string;
  syncStatus: string;
  syncError?: string;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  inventoryItemId?: string;
  lastSyncedAt?: string;
}

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
  marketplaces?: MarketplaceInfo[];
  marketplaceListings?: MarketplaceListing[];
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
