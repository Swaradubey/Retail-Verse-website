import type { Product } from '../api/products';

const DB_NAME = 'pos-offline-products';
const DB_VERSION = 1;
const STORE = 'kv';
const IDB_KEY = 'pos_products_list';
const LS_KEY = 'pos_products_cache_v1';

function normalizeForCache(raw: Product): Product {
  const barcode = (raw as Product & { barcode?: string }).barcode;
  const img =
    raw.image ||
    (raw as any).imageUrl ||
    (raw as any).thumbnail ||
    (Array.isArray((raw as any).images) && (raw as any).images.length > 0
      ? typeof (raw as any).images[0] === 'string'
        ? (raw as any).images[0]
        : (raw as any).images[0]?.url
      : undefined) ||
    (Array.isArray((raw as any).media) && (raw as any).media.length > 0
      ? (raw as any).media[0]?.url
      : undefined) ||
    '';
  const p: Product = {
    _id: raw._id,
    name: raw.name ?? '',
    sku: raw.sku ?? '',
    price: typeof raw.price === 'number' ? raw.price : Number(raw.price) || 0,
    stock: typeof raw.stock === 'number' ? raw.stock : Number(raw.stock) || 0,
    category: raw.category ?? '',
    image: img,
    description: raw.description,
    isActive: raw.isActive,
    status: raw.status,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    gst: Number((raw as any).gst !== undefined ? (raw as any).gst : (raw.gstRate || 0)),
    gstRate: Number(raw.gstRate !== undefined ? raw.gstRate : ((raw as any).gst || 0)),
  };
  if (barcode != null && String(barcode).length > 0) {
    (p as Product & { barcode?: string }).barcode = String(barcode);
  }
  return p;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

function getEffectiveKeys(clientId?: string) {
  const suffix = clientId ? `_${clientId}` : '';
  return {
    idb: `${IDB_KEY}${suffix}`,
    ls: `${LS_KEY}${suffix}`
  };
}

async function idbPut(products: Product[], clientId?: string): Promise<void> {
  const db = await openDb();
  const keys = getEffectiveKeys(clientId);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB write failed'));
      tx.objectStore(STORE).put(products, keys.idb);
    });
  } finally {
    db.close();
  }
}

async function idbGet(clientId?: string): Promise<Product[] | null> {
  const db = await openDb();
  const keys = getEffectiveKeys(clientId);
  try {
    const row = await new Promise<Product[] | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      tx.onerror = () => reject(tx.error ?? new Error('IDB read failed'));
      const req = tx.objectStore(STORE).get(keys.idb);
      req.onsuccess = () => resolve(req.result as Product[] | undefined);
      req.onerror = () => reject(req.error ?? new Error('IDB get failed'));
    });
    if (Array.isArray(row) && row.length > 0) return row;
    return null;
  } finally {
    db.close();
  }
}

function lsPut(products: Product[], clientId?: string): void {
  const keys = getEffectiveKeys(clientId);
  try {
    localStorage.setItem(keys.ls, JSON.stringify(products));
    // Also save under general key if scoped key was used, as reliable fallback
    if (clientId) {
      localStorage.setItem(LS_KEY, JSON.stringify(products));
    }
  } catch {
    /* quota or private mode */
  }
}

function lsGet(clientId?: string): Product[] | null {
  const keys = getEffectiveKeys(clientId);
  try {
    const raw = localStorage.getItem(keys.ls);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Product[];
    }
    // Fallback to un-suffixed key if scoped key was empty
    if (clientId) {
      const fallbackRaw = localStorage.getItem(LS_KEY);
      if (fallbackRaw) {
        const parsedFallback = JSON.parse(fallbackRaw) as unknown;
        if (Array.isArray(parsedFallback) && parsedFallback.length > 0) return parsedFallback as Product[];
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Synchronous localStorage read for instantaneous zero-delay initial POS state. */
export function getPosProductsLocalStorage(clientId?: string): Product[] {
  return lsGet(clientId) || [];
}

/**
 * Fast shallow comparison to detect whether the product catalog has actual differences.
 * Prevents unnecessary re-renders in stale-while-revalidate background updates.
 */
export function haveProductsChanged(current: any[], incoming: any[]): boolean {
  if (!Array.isArray(current) || !Array.isArray(incoming)) return true;
  if (current.length !== incoming.length) return true;
  for (let i = 0; i < current.length; i++) {
    const c = current[i];
    const n = incoming[i];
    const cId = String(c._id || c.id || c.productId || '');
    const nId = String(n._id || n.id || n.productId || '');
    if (cId !== nId) return true;
    if (Number(c.price ?? c.unitPrice) !== Number(n.price ?? n.unitPrice)) return true;
    if (Number(c.stock ?? c.stockLevel ?? c.quantity ?? c.currentStock) !== Number(n.stock ?? n.stockLevel ?? n.quantity ?? n.currentStock)) return true;
    if ((c.name || '') !== (n.name || '')) return true;
    if ((c.barcode || '') !== (n.barcode || '')) return true;
    if ((c.sku || '') !== (n.sku || '')) return true;
    if ((c.category || '') !== (n.category || '')) return true;
    if ((c.image || c.imageUrl || '') !== (n.image || n.imageUrl || '')) return true;
  }
  return false;
}

/** Persist POS product list after a successful online sync. */
export async function savePosProductsCache(products: Product[], clientId?: string): Promise<void> {
  const normalized = products.map(normalizeForCache);
  try {
    await idbPut(normalized, clientId);
  } catch {
    /* IndexedDB unavailable — localStorage only */
  }
  lsPut(normalized, clientId);
}

/** Load last synced POS products (IndexedDB first, then localStorage). */
export async function loadPosProductsCache(clientId?: string): Promise<Product[] | null> {
  try {
    const fromIdb = await idbGet(clientId);
    if (fromIdb && fromIdb.length > 0) return fromIdb;
    if (clientId) {
      const fallbackIdb = await idbGet(undefined);
      if (fallbackIdb && fallbackIdb.length > 0) return fallbackIdb;
    }
  } catch {
    /* fall through */
  }
  const fromLs = lsGet(clientId);
  return fromLs && fromLs.length > 0 ? fromLs : null;
}

/** Instantly upsert a newly created or updated product into the client's local POS cache. */
export async function upsertPosProductCache(product: Product, clientId?: string): Promise<Product[]> {
  const normalized = normalizeForCache(product);
  const existing = (await loadPosProductsCache(clientId)) || [];
  
  const normId = String(normalized._id || (normalized as any).id || (normalized as any).productId || '');
  const normSku = String(normalized.sku || '').trim().toLowerCase();
  const normBarcode = String((normalized as any).barcode || '').trim().toLowerCase();

  const idx = existing.findIndex((p) => {
    const pId = String(p._id || (p as any).id || (p as any).productId || '');
    const pSku = String(p.sku || '').trim().toLowerCase();
    const pBarcode = String((p as any).barcode || '').trim().toLowerCase();
    return (
      (normId && pId && normId === pId) ||
      (normBarcode && pBarcode && normBarcode === pBarcode) ||
      (normSku && pSku && normSku === pSku)
    );
  });

  let updatedList: Product[];
  if (idx >= 0) {
    updatedList = [...existing];
    updatedList[idx] = { ...updatedList[idx], ...normalized };
  } else {
    // Prepend newly added item so it displays first in POS grid
    updatedList = [normalized, ...existing];
  }

  await savePosProductsCache(updatedList, clientId);
  return updatedList;
}

/** Instantly remove a deleted product from the client's local POS cache. */
export async function removePosProductFromCache(productId: string, clientId?: string): Promise<Product[]> {
  const existing = (await loadPosProductsCache(clientId)) || [];
  const targetId = String(productId).trim();
  const updatedList = existing.filter((p) => {
    const pId = String(p._id || (p as any).id || (p as any).productId || '').trim();
    return pId !== targetId;
  });
  await savePosProductsCache(updatedList, clientId);
  return updatedList;
}

