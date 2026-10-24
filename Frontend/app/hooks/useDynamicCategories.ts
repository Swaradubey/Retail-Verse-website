import { useState, useEffect, useCallback, useMemo } from 'react';
import { productApi, Product } from '../api/products';
import { useAuth } from '../context/AuthContext';
import { subscribeToProductSync } from '../utils/posProductSync';

export interface CategoryOption {
  value: string; // The raw category value used in queries (e.g. "GROCERY")
  label: string; // The formatted display label (e.g. "Grocery")
}

/**
 * Formats a raw category string into Title Case.
 * Handles strings like "GROCERY" -> "Grocery", "home & garden" -> "Home & Garden", "ELECTRONICS" -> "Electronics".
 */
export function formatCategoryTitle(category: string): string {
  if (!category || typeof category !== 'string') return '';
  const trimmed = category.trim();
  if (!trimmed) return '';

  return trimmed
    .split(/(\s+|[-/&])/g)
    .map((token) => {
      if (!token) return '';
      if (/^(\s+|[-/&])$/.test(token)) return token;
      const lower = token.toLowerCase();
      // Keep minor words lowercase in compound titles
      if (lower === 'and' || lower === 'or' || lower === 'of') return lower;
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join('');
}

/**
 * Extracts unique, non-empty, valid category strings from product arrays.
 * Filters out invalid/placeholder values like 'undefined', 'null', 'All Categories', etc.
 */
export function extractUniqueCategories(items: unknown[]): string[] {
  if (!Array.isArray(items)) return [];
  const seenLower = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const cat = (item as { category?: unknown }).category;
    if (typeof cat === 'string') {
      const trimmed = cat.trim();
      const lower = trimmed.toLowerCase();
      if (
        trimmed &&
        lower !== 'all' &&
        lower !== 'all categories' &&
        lower !== 'all products' &&
        lower !== 'undefined' &&
        lower !== 'null'
      ) {
        if (!seenLower.has(lower)) {
          seenLower.add(lower);
          result.push(trimmed);
        }
      }
    }
  }

  return result.sort((a, b) => a.localeCompare(b));
}

/**
 * Reads any cached products from localStorage synchronously for zero-delay initial load.
 */
function getCachedProducts(clientId?: string | null): Product[] {
  if (typeof window === 'undefined') return [];
  try {
    const directKeys = [
      'inventory_products_cache',
      'inventory_products_cache_v1',
      clientId ? `inventory_products_cache_v1_${clientId}` : null,
      'inventory_products_cache_v1_global',
      clientId ? `pos_products_cache_v1_${clientId}` : null,
      'pos_products_cache_v1',
      'retailverse_pos_products_cache',
      'pos_products_cache',
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
  } catch {}
  return [];
}

/**
 * Custom hook to dynamically load active categories from:
 * 1. Synchronous localStorage cache (immediate render)
 * 2. Product API (background refresh)
 * 3. Real-time broadcast and storage sync events (POS / Inventory updates)
 */
export function useDynamicCategories() {
  const { user } = useAuth();
  const clientId =
    user?.clientId ||
    user?.linkedClientId ||
    (typeof window !== 'undefined' ? localStorage.getItem('retail_verse_client_id') : null) ||
    undefined;

  // 1. Initial synchronous state from local cache
  const [categories, setCategories] = useState<string[]>(() => {
    const cached = getCachedProducts(clientId);
    return extractUniqueCategories(cached);
  });

  const [isLoading, setIsLoading] = useState<boolean>(categories.length === 0);

  // 2. Refresh from backend API
  const refreshCategories = useCallback(async () => {
    try {
      const res = await productApi.getAll(clientId);
      if (res && res.success && Array.isArray(res.data)) {
        const cats = extractUniqueCategories(res.data);
        setCategories(cats);
      } else if (Array.isArray(res)) {
        const cats = extractUniqueCategories(res);
        setCategories(cats);
      }
    } catch {
      // In case network fetch fails, retain cached categories
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    // Check cache again on client change
    const cached = getCachedProducts(clientId);
    const cachedCats = extractUniqueCategories(cached);
    if (cachedCats.length > 0) {
      setCategories(cachedCats);
    }

    void refreshCategories();

    // 3. Real-time subscription to multi-tab / POS product updates
    const unsubscribeSync = subscribeToProductSync((newProduct) => {
      if (newProduct?.category && typeof newProduct.category === 'string') {
        const trimmed = newProduct.category.trim();
        if (trimmed) {
          setCategories((prev) => {
            const lower = trimmed.toLowerCase();
            const exists = prev.some((c) => c.toLowerCase() === lower);
            if (exists) return prev;
            return [...prev, trimmed].sort((a, b) => a.localeCompare(b));
          });
        }
      }
    }, clientId);

    // 4. Listen for storage events (e.g. products cached in another tab or inventory page)
    const handleStorage = (e: StorageEvent) => {
      if (e.key && (e.key.includes('inventory_products') || e.key.includes('pos_products'))) {
        const updatedProds = getCachedProducts(clientId);
        const cats = extractUniqueCategories(updatedProds);
        if (cats.length > 0) {
          setCategories(cats);
        }
      }
    };

    // 5. Listen for custom window events dispatched within the same tab
    const handleCustomUpdate = () => {
      const updatedProds = getCachedProducts(clientId);
      const cats = extractUniqueCategories(updatedProds);
      if (cats.length > 0) {
        setCategories(cats);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('retailverse-product-updated', handleCustomUpdate);

    return () => {
      unsubscribeSync();
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('retailverse-product-updated', handleCustomUpdate);
    };
  }, [clientId, refreshCategories]);

  // Formatted category options with value (raw) and label (Title Case)
  const categoryOptions = useMemo<CategoryOption[]>(() => {
    return categories.map((cat) => ({
      value: cat,
      label: formatCategoryTitle(cat),
    }));
  }, [categories]);

  return {
    rawCategories: categories,
    categoryOptions,
    isLoading,
    refreshCategories,
  };
}
