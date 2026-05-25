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
  } catch {
    /* quota or private mode */
  }
}

function lsGet(clientId?: string): Product[] | null {
  const keys = getEffectiveKeys(clientId);
  try {
    const raw = localStorage.getItem(keys.ls);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as Product[];
  } catch {
    return null;
  }
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
  } catch {
    /* fall through */
  }
  return lsGet(clientId);
}
