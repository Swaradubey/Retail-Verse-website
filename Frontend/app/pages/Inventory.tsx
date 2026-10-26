import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Navigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  LayoutGrid,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { InventoryStats, type InventoryStatsValues } from '../components/inventory/InventoryStats';
import { InventoryFilters } from '../components/inventory/InventoryFilters';
import { InventoryTable } from '../components/inventory/InventoryTable';
import { DeleteConfirmModal } from '../components/inventory/DeleteConfirmModal';
import { InventorySkeleton } from '../components/inventory/InventorySkeleton';
import { ProductModal } from '../components/inventory/ProductModal';
import { AddProductModal } from '../components/inventory/AddProductModal';
import { ProductDetailModal } from '../components/inventory/ProductDetailModal';
import { StoreManagerModal } from '../components/inventory/StoreManagerModal';
import { EmployeeModal } from '../components/inventory/EmployeeModal';
import { LowStockAlertModal } from '../components/inventory/LowStockAlertModal';
import { SortConfig, type InventoryItem } from '../types/inventory';
import { productApi, inventoryApi, Product } from '../api/products';
// import { products as staticProducts } from '../data/products';
import api from '../api/apiService';
import { clientsApi, type ClientRow } from '../api/clients';
import { employeesApi, type EmployeeRow } from '../api/employees';
import { storeManagersApi, type StoreManager } from '../api/storeManagers';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { broadcastProductSync } from '../utils/posProductSync';
import { slugifyProductName } from '../utils/wishlistPayload';
import {
  canAccessInventoryEditor,
  canAdjustInventoryStock,
  canCreateInventoryProduct,
  canDeleteInventoryProduct,
  canOpenProductEditModal,
  getInventoryEditMode,
} from '../utils/inventoryPermissions';
import { isClientRole } from '../utils/staffRoles';

const ITEMS_PER_PAGE = 50;
const STAFF_LIST_ITEMS_PER_PAGE = 6;
const INVENTORY_CACHE_PREFIX = 'retailverse_inventory_cache_';

function computeInventoryStats(items: Array<{ stock?: number; minStock?: number; lowStockThreshold?: number }>): InventoryStatsValues {
  const totalProducts = items.length;
  const inStock = items.filter((i) => Number(i.stock ?? 0) >= 10).length;
  const lowStock = items.filter((i) => {
    const stock = Number(i.stock ?? 0);
    if (stock <= 0) return false;
    const threshold = Number(i.minStock ?? i.lowStockThreshold ?? 10);
    return stock < threshold;
  }).length;
  const outOfStock = items.filter((i) => Number(i.stock ?? 0) === 0).length;
  return { totalProducts, inStock, lowStock, outOfStock };
}

function getCachedInventoryProducts(clientId?: string | null): Product[] {
  if (typeof window === 'undefined') return [];
  try {
    const directKeys = [
      'inventory_products_cache',
      'inventory_products_cache_v1',
      clientId ? `${INVENTORY_CACHE_PREFIX}${clientId}` : null,
      `${INVENTORY_CACHE_PREFIX}global`,
      clientId ? `pos_products_cache_v1_${clientId}` : null,
      'pos_products_cache_v1',
      'retailverse_pos_products_cache',
    ].filter(Boolean) as string[];

    for (const key of directKeys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {}
      }
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('inventory_products') || key.includes('pos_products'))) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed;
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn('[Inventory] Failed to read cached inventory:', err);
  }
  return [];
}

function saveCachedInventoryProducts(items: Product[], clientId?: string | null) {
  if (typeof window === 'undefined' || !Array.isArray(items)) return;
  try {
    const raw = JSON.stringify(items);
    localStorage.setItem('inventory_products_cache', raw);
    localStorage.setItem('inventory_products_cache_v1', raw);
    if (clientId) {
      localStorage.setItem(`${INVENTORY_CACHE_PREFIX}${clientId}`, raw);
      localStorage.setItem(`pos_products_cache_v1_${clientId}`, raw);
    }
    localStorage.setItem(`${INVENTORY_CACHE_PREFIX}global`, raw);
    localStorage.setItem('pos_products_cache_v1', raw);
  } catch (err) {
    console.warn('[Inventory] Failed to save cached inventory:', err);
  }
}

function saveCachedInventoryStats(statsData: InventoryStatsValues) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('inventory_stats_cache', JSON.stringify(statsData));
  } catch (err) {
    console.warn('[Inventory] Failed to save cached inventory stats:', err);
  }
}

function formatEmployeeRoleLabel(rawRole?: string): string {
  const normalized = String(rawRole || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!normalized) return '';
  return normalized.replace(/_/g, ' ');
}

export function Inventory() {
  const { user, isLoading: authLoading } = useAuth();
  const role = user?.role;
  const inventoryEditorRole = getInventoryEditMode(role);
  const allowAdd = canCreateInventoryProduct(role);
  const allowDelete = canDeleteInventoryProduct(role);
  const allowStockShortcut = canAdjustInventoryStock(role);
  const allowEditModal = canOpenProductEditModal(role);

  // 1. Synchronous Cache Initialization for products
  const [products, setProducts] = useState<Product[]>(() => {
    return getCachedInventoryProducts(user?.clientId);
  });

  // Synchronous Cache Initialization for inventory summary / stats counters
  const [stats, setStats] = useState<InventoryStatsValues | null>(() => {
    try {
      const cached = localStorage.getItem('inventory_stats_cache');
      if (cached) return JSON.parse(cached);
    } catch {}
    const initialProds = getCachedInventoryProducts(user?.clientId);
    if (initialProds.length > 0) {
      return computeInventoryStats(initialProds);
    }
    return null;
  });

  // 2. Eliminate Blocking Loading State:
  // If cache is present, loading is false so zero skeleton placeholder is rendered
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    const initialProds = getCachedInventoryProducts(user?.clientId);
    return initialProds.length === 0;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [stockStatus, setStockStatus] = useState<string | 'all'>('all');
  const [category, setCategory] = useState('All Categories');
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(999999);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'updatedAt',
    direction: 'desc',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [serverTotalPages, setServerTotalPages] = useState<number | null>(null);
  const [serverCategories, setServerCategories] = useState<string[]>([]);

  // Debounce search input to eliminate unnecessary API requests
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Modal states
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [productModalMode, setProductModalMode] = useState<'add' | 'edit'>('add');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [assignableClients, setAssignableClients] = useState<ClientRow[]>([]);

  const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [seoManagerModalOpen, setSeoManagerModalOpen] = useState(false);
  const [staffEmployees, setStaffEmployees] = useState<EmployeeRow[]>([]);
  const [staffEmployeesPage, setStaffEmployeesPage] = useState(1);
  const [employeesLoading, setEmployeesLoading] = useState(false);

  // 3. Background Stale-While-Revalidate Sync with Dynamic Pagination (50 items / request)
  const fetchAllProducts = useCallback(async (isManual = false, pageToFetch = currentPage) => {
    const cachedProds = getCachedInventoryProducts(user?.clientId);
    const hasAnyProducts = products.length > 0 || cachedProds.length > 0;
    // Show full skeleton ONLY if zero products exist anywhere in state or cache
    if (!isManual && !hasAnyProducts) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const response = await inventoryApi.getManage(isManual, {
        page: pageToFetch,
        limit: ITEMS_PER_PAGE,
        search: debouncedSearch,
        category,
        stockStatus,
        minPrice,
        maxPrice,
        sort: sortConfig.key,
        direction: sortConfig.direction,
      });

      if (response && response.success && Array.isArray(response.data)) {
        const freshData = response.data;
        setProducts(freshData);

        if (typeof response.total === 'number') {
          setServerTotal(response.total);
        }
        if (typeof response.totalPages === 'number') {
          setServerTotalPages(response.totalPages);
        }
        if (Array.isArray(response.categories) && response.categories.length > 0) {
          setServerCategories(response.categories);
        }

        const newStats = response.stats || computeInventoryStats(freshData);
        setStats(newStats);

        if (pageToFetch === 1 && !debouncedSearch && category === 'All Categories' && stockStatus === 'all') {
          saveCachedInventoryProducts(freshData, user?.clientId);
          saveCachedInventoryStats(newStats);
        }
      } else if (products.length === 0) {
        setProducts([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch inventory products', error);
      // Keep cached products if already present
      if (products.length === 0) {
        setProducts([]);
      }
      toast.error(error.message || 'Failed to fetch dynamic products.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.clientId, currentPage, debouncedSearch, category, stockStatus, minPrice, maxPrice, sortConfig]);

  // Hydrate from cache when user/clientId loads if current state is empty
  useEffect(() => {
    if (products.length === 0) {
      const cached = getCachedInventoryProducts(user?.clientId);
      if (cached.length > 0) {
        setProducts(cached);
        setIsLoading(false);
      }
    }
  }, [user?.clientId]);

  useEffect(() => {
    if (products.length > 0) {
      console.log("inventory products received:", products.length);
    }
  }, [products]);

  // Initial and reactive fetch on page / filter changes
  useEffect(() => {
    void fetchAllProducts(false, currentPage);
  }, [fetchAllProducts, currentPage]);

  const loadStaffEmployees = useCallback(async () => {
    if (!isClientRole(user?.role) || !user?.clientId) {
      setStaffEmployees([]);
      return;
    }
    setEmployeesLoading(true);
    try {
      const res = await employeesApi.listByClient(user.clientId, ['employee', 'staff', 'seo_manager']);
      const payload = res.data as EmployeeRow[] | { items?: EmployeeRow[] } | null | undefined;
      if (res.success && Array.isArray(payload)) {
        setStaffEmployees(payload);
      } else if (
        res.success &&
        payload &&
        !Array.isArray(payload) &&
        Array.isArray(payload.items)
      ) {
        setStaffEmployees(payload.items);
      } else {
        setStaffEmployees([]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load employees';
      toast.error(msg);
      setStaffEmployees([]);
    } finally {
      setEmployeesLoading(false);
    }
  }, [user?.role, user?.clientId]);

  const staffEmployeesTotalPages = Math.max(1, Math.ceil(staffEmployees.length / STAFF_LIST_ITEMS_PER_PAGE));
  const paginatedStaffEmployees = useMemo(() => {
    const start = (staffEmployeesPage - 1) * STAFF_LIST_ITEMS_PER_PAGE;
    return staffEmployees.slice(start, start + STAFF_LIST_ITEMS_PER_PAGE);
  }, [staffEmployees, staffEmployeesPage]);

  useEffect(() => {
    setStaffEmployeesPage((prev) => Math.min(prev, staffEmployeesTotalPages));
  }, [staffEmployeesTotalPages]);

  useEffect(() => {
    void loadStaffEmployees();
  }, [loadStaffEmployees]);

  useEffect(() => {
    if (user?.role !== 'super_admin') {
      setAssignableClients([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await clientsApi.list();
        if (!cancelled && res.success && Array.isArray(res.data)) {
          setAssignableClients(res.data);
        }
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  // Map Product to InventoryItem for the table component
  const inventoryItems = useMemo((): InventoryItem[] => {
    return products.map((p) => ({
      ...p,
      id: p._id || '',
      client: p.client ?? null,
    }));
  }, [products]);

  const isLowStock = useCallback((item: { stock?: number; minStock?: number; lowStockThreshold?: number }) => {
    const stock = Number(item.stock ?? 0);
    if (stock <= 0) return false;
    const threshold = Number(item.minStock ?? item.lowStockThreshold ?? 10);
    return stock < threshold;
  }, []);

  const isServerPaginated = serverTotalPages !== null && serverTotalPages > 0;

  const lowStockCount = stats?.lowStock !== undefined
    ? stats.lowStock
    : products.filter((p) => isLowStock(p)).length;

  const lowStockItems = useMemo(() => {
    return products.filter((p) => isLowStock(p));
  }, [products, isLowStock]);

  const outOfStockCount = stats?.outOfStock !== undefined
    ? stats.outOfStock
    : inventoryItems.filter((i) => (i.stock || 0) === 0).length;

  const inventoryCategoryList = useMemo(() => {
    const list = serverCategories.length > 0
      ? serverCategories
      : products.map((p) => (p.category ? String(p.category).trim() : ''));
    return Array.from(new Set(list.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [serverCategories, products]);

  // Filter and sort
  const filteredItems = useMemo(() => {
    let result = [...inventoryItems];

    if (search) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (item) =>
          (item.name?.toLowerCase() || '').includes(q) ||
          (item.sku?.toLowerCase() || '').includes(q) ||
          (item.barcode?.toLowerCase() || '').includes(q) ||
          (item.category?.toLowerCase() || '').includes(q)
      );
    }

    if (stockStatus !== 'all') {
      result = result.filter((item) => {
        if (stockStatus === 'in-stock') return (item.stock || 0) >= 10;
        if (stockStatus === 'low-stock') return isLowStock(item);
        if (stockStatus === 'out-of-stock') return (item.stock || 0) === 0;
        return true;
      });
    }

    if (category && category !== 'All Categories') {
      const targetCategory = category.toLowerCase().trim();
      result = result.filter((item) => (item.category?.toLowerCase().trim() || '') === targetCategory);
    }

    // Price range filter
    if (minPrice > 0 || maxPrice < 999999) {
      result = result.filter((item) => {
        const price = item.price ?? 0;
        return price >= minPrice && price <= maxPrice;
      });
    }

    result.sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      switch (sortConfig.key) {
        case 'name':
          return dir * (a.name?.localeCompare(b.name || '') || 0);
        case 'price':
          return dir * ((a.price || 0) - (b.price || 0));
        case 'stock':
          return dir * ((a.stock || 0) - (b.stock || 0));
        case 'updatedAt':
          return dir * (new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime());
        default:
          return 0;
      }
    });

    return result;
  }, [inventoryItems, search, stockStatus, category, minPrice, maxPrice, sortConfig]);

  // Pagination
  const totalPages = isServerPaginated
    ? Math.max(1, serverTotalPages)
    : Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));

  const paginatedItems = useMemo(() => {
    if (isServerPaginated) {
      return inventoryItems;
    }
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [isServerPaginated, inventoryItems, filteredItems, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, stockStatus, category, minPrice, maxPrice]);

  const handleSort = useCallback((key: SortConfig['key']) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const handleSaveProduct = async (productData: Product | Partial<Product>) => {
    try {
      if (productModalMode === 'add') {
        if (!allowAdd) {
          toast.error('You are not allowed to add products');
          return;
        }
        const saveToastId = toast.loading('Saving product to inventory...');
        const response = await inventoryApi.create(productData as Product);
        if (response.success) {
          const createdProduct = response.data || productData;
          broadcastProductSync(createdProduct, user?.clientId);
          setProducts((prev) => {
            const next = [createdProduct as Product, ...prev.filter((p) => p._id !== createdProduct._id)];
            saveCachedInventoryProducts(next, user?.clientId);
            const nextStats = computeInventoryStats(next);
            setStats(nextStats);
            saveCachedInventoryStats(nextStats);
            return next;
          });
          setIsProductModalOpen(false);
          toast.success('Product created & synced to POS!', { id: saveToastId });
          void fetchAllProducts();
        } else {
          toast.dismiss(saveToastId);
          throw new Error(response.message);
        }
      } else if (selectedProduct?._id) {
        let body: Product | Partial<Product> = productData;
        if (inventoryEditorRole === 'inventory_manager') {
          const pd = productData as Partial<Product>;
          body = {};
          if (pd.title !== undefined) body.title = pd.title;
          else if (pd.name !== undefined) body.title = pd.name;
          if (pd.description !== undefined) body.description = pd.description;
        }
        const response = await inventoryApi.update(selectedProduct._id, body);
        if (response.success) {
          const updatedProduct = response.data || (response as any).product || { ...selectedProduct, ...body };
          broadcastProductSync(updatedProduct, user?.clientId);
          setProducts((prev) => {
            const next = prev.map((p) => (p._id === selectedProduct._id ? { ...p, ...updatedProduct } : p));
            saveCachedInventoryProducts(next, user?.clientId);
            const nextStats = computeInventoryStats(next);
            setStats(nextStats);
            saveCachedInventoryStats(nextStats);
            return next;
          });
          setIsProductModalOpen(false);
          toast.success(response.message || 'Product updated successfully');
          void fetchAllProducts();
        } else {
          throw new Error(response.message);
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to save product');
      throw error; // Re-throw to be handled by the modal if it has internal error state
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!productToDelete?._id) return;
    try {
      const response = await inventoryApi.delete(productToDelete._id);
      if (response.success) {
        setProducts((prev) => {
          const next = prev.filter((p) => p._id !== productToDelete._id);
          saveCachedInventoryProducts(next, user?.clientId);
          const nextStats = computeInventoryStats(next);
          setStats(nextStats);
          saveCachedInventoryStats(nextStats);
          return next;
        });
        toast.success('Product deleted successfully');
        setIsDeleteModalOpen(false);
        setProductToDelete(null);
      } else {
        throw new Error(response.message);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete product');
    }
  };

  const handleRetrySync = async (productId: string, marketplaces?: string[]) => {
    const toastId = toast.loading('Initiating sync retry for marketplaces...');
    try {
      const response = await api.post(`/products/${productId}/sync`, { marketplaces });
      const res = response.data || response;
      if (res.success) {
        toast.success(res.message || 'Sync retry initiated successfully', { id: toastId });
        await fetchAllProducts();
      } else {
        throw new Error(res.message || 'Sync retry was not acknowledged by server');
      }
    } catch (err: any) {
      toast.error(err.message || 'Sync retry failed', { id: toastId });
    }
  };
 
  if (authLoading && !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-[linear-gradient(165deg,#faf9f7_0%,#f7f5ff_45%,#f0f7ff_100%)] dark:bg-[linear-gradient(165deg,#09090b_0%,#0c0a12_50%,#09090b_100%)]">
        <div className="h-10 w-10 border-[3px] border-indigo-400/30 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (user && !canAccessInventoryEditor(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(165deg,#faf9f7_0%,#f5f3ff_38%,#f3f8ff_72%,#faf8f5_100%)] dark:bg-[linear-gradient(165deg,#09090b_0%,#0c0a12_50%,#09090b_100%)]">
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 right-[-10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(199,210,254,0.35)_0%,transparent_65%)] blur-2xl dark:bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.12)_0%,transparent_60%)]" />
        <div className="absolute top-1/3 left-[-8%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle_at_center,rgba(253,230,224,0.45)_0%,transparent_62%)] blur-2xl dark:opacity-40" />
        <div className="absolute bottom-[-15%] right-[20%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(219,234,254,0.5)_0%,transparent_58%)] blur-2xl dark:bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.08)_0%,transparent_55%)]" />
      </div>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <InventorySkeleton />
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35 }}
              className="space-y-8 sm:space-y-10"
            >
              {/* Header */}
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-white/70 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-md dark:border-indigo-500/25 dark:bg-indigo-950/35 dark:text-indigo-200">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25">
                        <LayoutGrid className="h-3 w-3" strokeWidth={2.5} />
                      </span>
                      Stock Management
                    </span>
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
                    Inventory Management
                  </h1>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
                  <Button
                    variant="outline"
                    onClick={() => void fetchAllProducts(true)}
                    disabled={isRefreshing}
                    className="h-11 rounded-2xl border-violet-200/80 bg-white/80 px-4 text-sm font-semibold text-violet-900 shadow-[0_2px_8px_-2px_rgba(109,40,217,0.12)] backdrop-blur-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:border-violet-300 hover:bg-white hover:shadow-[0_8px_24px_-8px_rgba(109,40,217,0.2)] dark:border-violet-500/30 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/55 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
                    <span className="ml-2 hidden text-sm font-semibold sm:inline">{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
                  </Button>
                  {allowAdd && (
                    <Button
                      onClick={() => {
                        setIsAddProductModalOpen(true);
                      }}
                      className="h-11 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 px-5 text-sm font-semibold text-white shadow-[0_4px_20px_-4px_rgba(79,70,229,0.45)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(79,70,229,0.55)] active:translate-y-0"
                    >
                      <Plus className="mr-2 h-4 w-4" strokeWidth={2.5} />
                      Add Product
                    </Button>
                  )}
                </div>
              </div>

              {/* Notification Banner/Card */}
              <AnimatePresence>
                {(lowStockCount > 0 || outOfStockCount > 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    className="relative overflow-hidden rounded-[1.25rem] border border-orange-200/80 bg-gradient-to-r from-orange-50/80 via-amber-50/50 to-orange-50/30 p-5 shadow-[0_4px_20px_-4px_rgba(249,115,22,0.12)] backdrop-blur-md dark:border-orange-500/20 dark:from-orange-950/20 dark:via-amber-950/10 dark:to-orange-950/5 dark:shadow-none sm:p-6"
                  >
                    <div className="absolute right-[-4%] top-[-30%] h-36 w-36 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 opacity-[0.06] blur-2xl" />
                    
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 shadow-sm">
                          <AlertTriangle className="h-5 w-5 animate-pulse" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-[15px] font-bold text-orange-950 dark:text-orange-100">
                            Attention: Inventory Action Required
                          </h3>
                          <p className="text-sm text-orange-900/90 dark:text-orange-300/90 leading-relaxed max-w-[720px]">
                            {outOfStockCount > 0 && lowStockCount > 0 ? (
                              <>
                                You have <span className="font-semibold text-rose-600 dark:text-rose-400">{outOfStockCount} items out of stock</span> and <span className="font-semibold text-orange-600 dark:text-orange-400">{lowStockCount} items running low</span>. Replenish stock soon to prevent customer disruption.
                              </>
                            ) : outOfStockCount > 0 ? (
                              <>
                                You have <span className="font-semibold text-rose-600 dark:text-rose-400">{outOfStockCount} items out of stock</span>. Replenish stock soon to prevent customer disruption.
                              </>
                            ) : (
                              <>
                                You have <span className="font-semibold text-orange-600 dark:text-orange-400">{lowStockCount} items running low on stock</span> (less than 10 units left). Consider replenishing soon.
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex shrink-0 items-center gap-2.5 sm:justify-end">
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => setStockStatus(stockStatus === 'low-stock' ? 'all' : 'low-stock')}
                          className="h-10 rounded-xl border-orange-200 bg-white/95 px-4 text-xs font-bold text-orange-800 shadow-[0_2px_8px_-2px_rgba(249,115,22,0.1)] transition-all duration-300 hover:bg-orange-50 hover:border-orange-300 cursor-pointer dark:border-orange-500/20 dark:bg-orange-950/40 dark:text-orange-200 dark:hover:bg-orange-950/60"
                        >
                          View Alerts
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Stats */}
              <InventoryStats items={inventoryItems} stats={stats} />



              {/* Filters */}
              <InventoryFilters
                search={search}
                onSearchChange={setSearch}
                stockStatus={stockStatus as any}
                onStockStatusChange={setStockStatus as any}
                category={category}
                onCategoryChange={setCategory}
                categories={inventoryCategoryList}
                minPrice={minPrice}
                onMinPriceChange={setMinPrice}
                maxPrice={maxPrice}
                onMaxPriceChange={setMaxPrice}
              />

              {/* Table */}
              <InventoryTable
                items={paginatedItems}
                sortConfig={sortConfig}
                onSort={handleSort}
                showProductEdit={allowEditModal}
                showStockAdjust={allowStockShortcut}
                showProductDelete={allowDelete}
                onView={(item) => {
                  setSelectedProduct(products.find(p => p._id === item.id) || null);
                  setIsDetailModalOpen(true);
                }}
                onEdit={(item) => {
                  if (!allowEditModal) return;
                  setProductModalMode('edit');
                  setSelectedProduct(products.find(p => p._id === item.id) || null);
                  setIsProductModalOpen(true);
                }}
                onUpdateStock={(item) => {
                  if (!allowStockShortcut) return;
                  setProductModalMode('edit');
                  setSelectedProduct(products.find(p => p._id === item.id) || null);
                  setIsProductModalOpen(true);
                }}
                onDelete={(item) => {
                  if (!allowDelete) return;
                  setProductToDelete(products.find(p => p._id === item.id) || null);
                  setIsDeleteModalOpen(true);
                }}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={ITEMS_PER_PAGE}
                onRetrySync={handleRetrySync}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AddProductModal
        isOpen={isAddProductModalOpen}
        onClose={() => setIsAddProductModalOpen(false)}
        onProductCreated={(newProduct) => {
          if (newProduct) {
            broadcastProductSync(newProduct, user?.clientId);
            setProducts((prev) => {
              const next = [newProduct as Product, ...prev.filter((p) => p._id !== newProduct._id)];
              saveCachedInventoryProducts(next, user?.clientId);
              return next;
            });
          }
          void fetchAllProducts(true);
        }}
      />

      <ProductModal
        isOpen={isProductModalOpen}
        mode={productModalMode}
        product={selectedProduct}
        onClose={() => setIsProductModalOpen(false)}
        onSave={handleSaveProduct}
        inventoryEditMode={productModalMode === 'add' ? 'admin' : inventoryEditorRole!}
        viewerRole={role}
        assignableClients={assignableClients}
      />

      <ProductDetailModal
        isOpen={isDetailModalOpen}
        product={selectedProduct}
        onClose={() => setIsDetailModalOpen(false)}
      />

      <DeleteConfirmModal
        open={isDeleteModalOpen}
        productName={productToDelete?.name || ''}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setIsDeleteModalOpen(false)}
      />

      <LowStockAlertModal
        isOpen={isLowStockModalOpen}
        items={lowStockItems}
        onClose={() => setIsLowStockModalOpen(false)}
      />

      <EmployeeModal
        isOpen={employeeModalOpen}
        onClose={() => setEmployeeModalOpen(false)}
        onCreated={() => {
          toast.success('Employee added successfully');
          setStaffEmployeesPage(1);
          void loadStaffEmployees();
        }}
      />

      <EmployeeModal
        isOpen={staffModalOpen}
        onClose={() => setStaffModalOpen(false)}
        role="staff"
        title="Add staff"
        subtitle="Create a staff login linked to this client account"
        submitLabel="Save staff"
        onCreated={() => {
          toast.success('Staff added successfully');
          setStaffEmployeesPage(1);
          void loadStaffEmployees();
        }}
      />

      <EmployeeModal
        isOpen={seoManagerModalOpen}
        onClose={() => setSeoManagerModalOpen(false)}
        role="seo_manager"
        title="Add SEO manager"
        subtitle="Create an SEO manager login linked to this client account"
        submitLabel="Save SEO manager"
        onCreated={() => {
          toast.success('SEO manager added successfully');
          setStaffEmployeesPage(1);
          void loadStaffEmployees();
        }}
      />
    </div>
  );
}
