/**
 * POS IndexedDB Service & Offline-First Storage Engine
 * Provides IndexedDB stores for:
 *   - 'held_orders': Parked/held multi-carts with snapshots and recall capability
 *   - 'offline_orders': Locally completed Cash orders (PENDING_SYNC) awaiting reconnection
 *   - 'cached_products': Offline product catalog caching for barcode scanning & searches
 *   - 'active_cart': Auto-saved draft of active cart across tab refreshes
 */

export interface POSCartItem {
  productId: string;
  barcode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  gst?: number;
  gstRate: number;
  stockLevel: number;
  imageUrl?: string;
  category?: string;
  price?: number;
  tax?: number;
  gstAmount?: number;
}

export interface AppliedCoupon {
  code: string;
  discount: number;
  minSubtotal: number;
}

export interface HeldOrder {
  id: string; // Primary local key, e.g. HOLD-YYMMDD-XXXX
  clientId?: string;
  serverOrderId?: string; // MongoDB _id or orderId once synced
  reference: string; // Label / Token / Customer Name
  items: POSCartItem[];
  subtotal: number;
  discountAmount: number;
  totalGst: number;
  grandTotal: number;
  totalAmount: number;
  appliedCoupon?: AppliedCoupon | null;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  status: 'HELD';
  createdAt: string;
  updatedAt: string;
  isSynced: boolean;
}

export interface OfflineOrder {
  id: string;
  clientId?: string;
  serverOrderId?: string;
  invoiceNumber: string;
  orderId: string;
  items: POSCartItem[];
  subtotal: number;
  discountAmount: number;
  totalGst: number;
  grandTotal: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  syncStatus: 'PENDING_SYNC' | 'SYNCED' | 'FAILED';
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  createdAt: string;
  paidAt?: string;
  isSynced: boolean;
  couponCode?: string;
}

const DB_NAME = 'retailverse_pos_offline_db';
const DB_VERSION = 3;

const STORES = {
  HELD_ORDERS: 'held_orders',
  OFFLINE_ORDERS: 'offline_orders',
  CACHED_PRODUCTS: 'cached_products',
  ACTIVE_CART: 'active_cart',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Extract clean string client ID from product or object
 */
export function extractProductClientId(p: any): string {
  if (!p) return '';
  const raw = p.clientId ?? p.client ?? p.ownerId ?? p.storeId ?? p.tenantId;
  if (raw) {
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'object') {
      if (raw._id) return String(raw._id).trim();
      if (raw.id) return String(raw.id).trim();
    }
  }
  return '';
}

function openPOSDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only available in browser environment'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // 1. Held Orders Store
      let heldStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORES.HELD_ORDERS)) {
        heldStore = db.createObjectStore(STORES.HELD_ORDERS, { keyPath: 'id' });
        heldStore.createIndex('status', 'status', { unique: false });
        heldStore.createIndex('createdAt', 'createdAt', { unique: false });
        heldStore.createIndex('isSynced', 'isSynced', { unique: false });
        heldStore.createIndex('clientId', 'clientId', { unique: false });
      } else {
        heldStore = request.transaction!.objectStore(STORES.HELD_ORDERS);
        if (!heldStore.indexNames.contains('clientId')) {
          heldStore.createIndex('clientId', 'clientId', { unique: false });
        }
      }

      // 2. Offline Completed Orders Store (Pending sync)
      let offlineStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORES.OFFLINE_ORDERS)) {
        offlineStore = db.createObjectStore(STORES.OFFLINE_ORDERS, { keyPath: 'id' });
        offlineStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        offlineStore.createIndex('createdAt', 'createdAt', { unique: false });
        offlineStore.createIndex('isSynced', 'isSynced', { unique: false });
        offlineStore.createIndex('clientId', 'clientId', { unique: false });
      } else {
        offlineStore = request.transaction!.objectStore(STORES.OFFLINE_ORDERS);
        if (!offlineStore.indexNames.contains('clientId')) {
          offlineStore.createIndex('clientId', 'clientId', { unique: false });
        }
      }

      // 3. Cached Products for Offline Scanning
      let prodStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORES.CACHED_PRODUCTS)) {
        prodStore = db.createObjectStore(STORES.CACHED_PRODUCTS, { keyPath: 'productId' });
        prodStore.createIndex('barcode', 'barcode', { unique: false });
        prodStore.createIndex('sku', 'sku', { unique: false });
        prodStore.createIndex('name', 'name', { unique: false });
        prodStore.createIndex('clientId', 'clientId', { unique: false });
      } else {
        prodStore = request.transaction!.objectStore(STORES.CACHED_PRODUCTS);
        if (!prodStore.indexNames.contains('clientId')) {
          prodStore.createIndex('clientId', 'clientId', { unique: false });
        }
      }

      // 4. Active Cart Draft Store
      if (!db.objectStoreNames.contains(STORES.ACTIVE_CART)) {
        db.createObjectStore(STORES.ACTIVE_CART, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error('[IndexedDB] Failed to open POS database:', request.error);
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELD ORDERS (PARK / RECALL MULTI-CART)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save or update a held order in IndexedDB
 */
export async function saveHeldOrder(order: HeldOrder, clientScopeId?: string): Promise<HeldOrder> {
  const db = await openPOSDatabase();
  const cId = clientScopeId || order.clientId || '';
  const orderToSave: HeldOrder = { ...order, clientId: cId };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.HELD_ORDERS], 'readwrite');
    const store = tx.objectStore(STORES.HELD_ORDERS);
    const req = store.put(orderToSave);

    req.onsuccess = () => resolve(orderToSave);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Fetch all held orders from IndexedDB sorted newest first, scoped by clientId
 */
export async function getHeldOrders(clientScopeId?: string): Promise<HeldOrder[]> {
  const db = await openPOSDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.HELD_ORDERS], 'readonly');
    const store = tx.objectStore(STORES.HELD_ORDERS);
    const req = store.getAll();

    req.onsuccess = () => {
      let orders = (req.result || []) as HeldOrder[];
      const target = (clientScopeId || '').trim();

      if (target) {
        orders = orders.filter((o) => !o.clientId || String(o.clientId).trim() === target);
      }

      // Sort newest first
      orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(orders);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get count of active held orders in IndexedDB
 */
export async function getHeldOrdersCount(clientScopeId?: string): Promise<number> {
  try {
    const orders = await getHeldOrders(clientScopeId);
    return orders.length;
  } catch (err) {
    return 0;
  }
}

/**
 * Remove/delete a held order from IndexedDB when recalled or cancelled
 */
export async function deleteHeldOrder(id: string): Promise<void> {
  const db = await openPOSDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.HELD_ORDERS], 'readwrite');
    const store = tx.objectStore(STORES.HELD_ORDERS);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Update sync status and server ID of a held order in IndexedDB
 */
export async function markHeldOrderSynced(id: string, serverOrderId: string): Promise<void> {
  const db = await openPOSDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.HELD_ORDERS], 'readwrite');
    const store = tx.objectStore(STORES.HELD_ORDERS);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result as HeldOrder | undefined;
      if (existing) {
        existing.isSynced = true;
        existing.serverOrderId = serverOrderId;
        existing.updatedAt = new Date().toISOString();
        store.put(existing);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OFFLINE ORDERS (COMPLETED CASH CHECKOUTS PENDING SYNC)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save an offline completed checkout (Cash payment recorded while offline)
 */
export async function saveOfflineOrder(order: OfflineOrder, clientScopeId?: string): Promise<OfflineOrder> {
  const db = await openPOSDatabase();
  const cId = clientScopeId || order.clientId || '';
  const orderToSave: OfflineOrder = { ...order, clientId: cId };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.OFFLINE_ORDERS], 'readwrite');
    const store = tx.objectStore(STORES.OFFLINE_ORDERS);
    const req = store.put(orderToSave);

    req.onsuccess = () => resolve(orderToSave);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Fetch all pending offline orders that need to be pushed to the server
 */
export async function getPendingOfflineOrders(clientScopeId?: string): Promise<OfflineOrder[]> {
  const db = await openPOSDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.OFFLINE_ORDERS], 'readonly');
    const store = tx.objectStore(STORES.OFFLINE_ORDERS);
    const req = store.getAll();

    req.onsuccess = () => {
      let orders = (req.result || []) as OfflineOrder[];
      const target = (clientScopeId || '').trim();
      if (target) {
        orders = orders.filter((o) => !o.clientId || String(o.clientId).trim() === target);
      }
      const pending = orders.filter((o) => o.syncStatus === 'PENDING_SYNC' || !o.isSynced);
      resolve(pending);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Mark an offline completed order as synced with MongoDB
 */
export async function markOfflineOrderSynced(id: string, serverOrderId?: string): Promise<void> {
  const db = await openPOSDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.OFFLINE_ORDERS], 'readwrite');
    const store = tx.objectStore(STORES.OFFLINE_ORDERS);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result as OfflineOrder | undefined;
      if (existing) {
        existing.syncStatus = 'SYNCED';
        existing.isSynced = true;
        if (serverOrderId) existing.serverOrderId = serverOrderId;
        store.put(existing);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT CACHING (OFFLINE CATALOG & BARCODE SCANNING)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clear cached products from IndexedDB.
 * If keepClientId is provided, only removes products belonging to other clients or with no clientId.
 * If keepClientId is omitted, clears all cached products in the store.
 */
export async function clearCachedProducts(keepClientId?: string): Promise<void> {
  try {
    const db = await openPOSDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.CACHED_PRODUCTS], 'readwrite');
      const store = tx.objectStore(STORES.CACHED_PRODUCTS);

      if (!keepClientId) {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } else {
        const target = String(keepClientId).trim();
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            const item = cursor.value;
            const itemClient = extractProductClientId(item);
            if (!itemClient || itemClient !== target) {
              cursor.delete();
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      }
    });
  } catch (err) {
    console.warn('[IndexedDB] Clear cached products warning:', err);
  }
}

/**
 * Cache loaded products into IndexedDB for instantaneous offline scan resolution.
 * Strictly scopes all cached items to the specified clientId and purges stale/cross-client products.
 */
export async function cacheProducts(products: any[], clientScopeId?: string): Promise<void> {
  if (!Array.isArray(products) || products.length === 0) return;
  const targetClientId = (clientScopeId || '').trim();

  try {
    // 1. Clear out any cross-client or stale products to prevent data leaks
    if (targetClientId) {
      await clearCachedProducts(targetClientId);
    }

    const db = await openPOSDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.CACHED_PRODUCTS], 'readwrite');
      const store = tx.objectStore(STORES.CACHED_PRODUCTS);

      for (const p of products) {
        const pId = String(p._id || p.id || p.productId);
        if (!pId) continue;

        const prodClientId = extractProductClientId(p) || targetClientId;

        // If clientScopeId is provided, do NOT store products belonging to another client
        if (targetClientId && prodClientId && prodClientId !== targetClientId) {
          continue;
        }

        store.put({
          productId: pId,
          _id: pId,
          name: p.name || 'Unnamed',
          barcode: String(p.barcode || '').trim(),
          sku: String(p.sku || '').trim(),
          unitPrice: Number(p.unitPrice !== undefined ? p.unitPrice : p.price) || 0,
          price: Number(p.unitPrice !== undefined ? p.unitPrice : p.price) || 0,
          stockLevel: Number(p.stockLevel ?? p.stock ?? p.quantity ?? p.currentStock ?? 0),
          stock: Number(p.stockLevel ?? p.stock ?? p.quantity ?? p.currentStock ?? 0),
          quantity: Number(p.stockLevel ?? p.stock ?? p.quantity ?? p.currentStock ?? 0),
          currentStock: Number(p.stockLevel ?? p.stock ?? p.quantity ?? p.currentStock ?? 0),
          gstRate: Number(p.gstRate) || 0,
          category: p.category || '',
          imageUrl: p.imageUrl || p.image || '',
          image: p.imageUrl || p.image || '',
          clientId: prodClientId || targetClientId,
          client: prodClientId || targetClientId,
          ownerId: prodClientId || targetClientId,
          storeId: p.storeId || targetClientId,
        });
      }

      tx.oncomplete = () => {
        try {
          const lsKey = targetClientId ? `pos_products_cache_v1_${targetClientId}` : 'pos_products_cache_v1';
          localStorage.setItem(lsKey, JSON.stringify(products));
          if (targetClientId) {
            localStorage.setItem('pos_products_cache_v1', JSON.stringify(products));
          }
        } catch {}
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Product cache failed:', err);
  }
}

/**
 * Instantly upserts a single product into IndexedDB cached products store,
 * strictly scoped to the active client ID.
 */
export async function upsertCachedProduct(product: any, clientScopeId?: string): Promise<void> {
  if (!product) return;
  const pId = String(product._id || product.id || product.productId || '');
  if (!pId) return;

  const targetClientId = (clientScopeId || extractProductClientId(product) || '').trim();

  try {
    const db = await openPOSDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.CACHED_PRODUCTS], 'readwrite');
      const store = tx.objectStore(STORES.CACHED_PRODUCTS);

      store.put({
        productId: pId,
        _id: pId,
        name: product.name || 'Unnamed',
        barcode: String(product.barcode || '').trim(),
        sku: String(product.sku || '').trim(),
        unitPrice: Number(product.unitPrice !== undefined ? product.unitPrice : product.price) || 0,
        price: Number(product.unitPrice !== undefined ? product.unitPrice : product.price) || 0,
        stockLevel: Number(product.stockLevel ?? product.stock ?? product.quantity ?? product.currentStock ?? 0),
        stock: Number(product.stockLevel ?? product.stock ?? product.quantity ?? product.currentStock ?? 0),
        quantity: Number(product.stockLevel ?? product.stock ?? product.quantity ?? product.currentStock ?? 0),
        currentStock: Number(product.stockLevel ?? product.stock ?? product.quantity ?? product.currentStock ?? 0),
        gstRate: Number(product.gstRate) || 0,
        category: product.category || 'General',
        imageUrl: product.imageUrl || product.image || '',
        image: product.imageUrl || product.image || '',
        clientId: targetClientId,
        client: targetClientId,
        ownerId: targetClientId,
        storeId: product.storeId || targetClientId,
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Upsert cached product failed:', err);
  }
}

/**
 * Retrieve cached products from IndexedDB when network is unavailable.
 * Strictly scopes results to the authenticated client ID.
 * If clientScopeId is provided and no products match, returns [] (never returns other clients' products).
 */
export async function getCachedProducts(clientScopeId?: string): Promise<any[]> {
  try {
    const db = await openPOSDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.CACHED_PRODUCTS], 'readonly');
      const store = tx.objectStore(STORES.CACHED_PRODUCTS);
      const req = store.getAll();

      req.onsuccess = () => {
        const all = (req.result || []) as any[];
        const target = (clientScopeId || '').trim();

        if (!target) {
          // If no clientScopeId is specified, check if there is an active client ID stored locally
          let fallbackClientId = '';
          try {
            fallbackClientId = localStorage.getItem('retail_verse_client_id') || '';
            if (!fallbackClientId) {
              const u = localStorage.getItem('eco_shop_user');
              if (u) {
                const parsed = JSON.parse(u);
                fallbackClientId = parsed.clientId || parsed.assignedClient || parsed.linkedClientId || (parsed.role === 'client' ? (parsed.id || parsed._id) : '') || '';
              }
            }
          } catch {}

          if (fallbackClientId) {
            const scoped = all.filter((p) => {
              const pClient = extractProductClientId(p);
              return pClient === fallbackClientId;
            });
            resolve(scoped);
            return;
          }

          // If still no client identifier, return empty array to prevent cross-client leaks
          resolve([]);
          return;
        }

        // Strict filter: ONLY return products that belong to this client
        const scoped = all.filter((p) => {
          const pClient = extractProductClientId(p);
          return pClient === target;
        });

        resolve(scoped);
      };

      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return [];
  }
}

/**
 * Find product by barcode or SKU in IndexedDB cached products, strictly within current client catalog
 */
export async function findCachedProductByBarcode(code: string, clientScopeId?: string): Promise<any | null> {
  const norm = String(code).trim().toLowerCase();
  if (!norm) return null;
  const products = await getCachedProducts(clientScopeId);
  return (
    products.find(
      (p) =>
        (p.barcode && String(p.barcode).trim().toLowerCase() === norm) ||
        (p.sku && String(p.sku).trim().toLowerCase() === norm) ||
        (p.productId && String(p.productId).trim().toLowerCase() === norm) ||
        (p._id && String(p._id).trim().toLowerCase() === norm)
    ) || null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE CART DRAFT (PREVENTS ACCIDENTAL DATA LOSS ON REFRESH)
// ─────────────────────────────────────────────────────────────────────────────

export async function saveActiveCartDraft(
  cart: POSCartItem[],
  appliedCoupon: AppliedCoupon | null,
  customerMeta?: { name?: string; phone?: string; email?: string },
  clientScopeId?: string
): Promise<void> {
  try {
    const db = await openPOSDatabase();
    const draftKey = clientScopeId ? `active_draft_${clientScopeId}` : 'active_draft';
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.ACTIVE_CART], 'readwrite');
      const store = tx.objectStore(STORES.ACTIVE_CART);
      store.put({
        id: draftKey,
        clientId: clientScopeId,
        cart,
        appliedCoupon,
        customerMeta,
        updatedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {}
}

export async function getActiveCartDraft(clientScopeId?: string): Promise<{
  cart: POSCartItem[];
  appliedCoupon: AppliedCoupon | null;
  customerMeta?: { name?: string; phone?: string; email?: string };
} | null> {
  try {
    const db = await openPOSDatabase();
    const draftKey = clientScopeId ? `active_draft_${clientScopeId}` : 'active_draft';
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.ACTIVE_CART], 'readonly');
      const store = tx.objectStore(STORES.ACTIVE_CART);
      const req = store.get(draftKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return null;
  }
}

export async function clearActiveCartDraft(clientScopeId?: string): Promise<void> {
  try {
    const db = await openPOSDatabase();
    const draftKey = clientScopeId ? `active_draft_${clientScopeId}` : 'active_draft';
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.ACTIVE_CART], 'readwrite');
      const store = tx.objectStore(STORES.ACTIVE_CART);
      store.delete(draftKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPREHENSIVE BACKGROUND SYNC ENGINE (TRIGGERED ON RECONNECT)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Synchronizes unsynced held orders & completed offline orders with the backend.
 * Also pulls remote held orders to keep multi-terminal / state synchronized.
 */
export async function syncOfflineAndHeldOrders(
  apiService: {
    post: (url: string, data?: any) => Promise<any>;
    get: (url: string) => Promise<any>;
  },
  clientScopeId?: string
): Promise<{
  syncedOfflineCount: number;
  syncedHeldCount: number;
  remoteHeldOrders: any[];
}> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return { syncedOfflineCount: 0, syncedHeldCount: 0, remoteHeldOrders: [] };
  }

  let syncedOfflineCount = 0;
  let syncedHeldCount = 0;
  let remoteHeldOrders: any[] = [];

  try {
    const [pendingOffline, localHeld] = await Promise.all([
      getPendingOfflineOrders(clientScopeId),
      getHeldOrders(clientScopeId),
    ]);

    const unsyncedHeld = localHeld.filter((h) => !h.isSynced);

    // 1. Push batch sync if there are pending offline or unsynced held orders
    if (pendingOffline.length > 0 || unsyncedHeld.length > 0) {
      const payloadOrders = [
        ...unsyncedHeld.map((h) => ({
          ...h,
          clientId: clientScopeId || h.clientId,
          offlineOrderId: h.id,
          status: 'HELD',
          orderStatus: 'held',
        })),
        ...pendingOffline.map((o) => ({
          ...o,
          clientId: clientScopeId || o.clientId,
          offlineOrderId: o.id,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
        })),
      ];

      try {
        const syncRes = await apiService.post('/pos/orders/sync', { orders: payloadOrders });

        if (syncRes && syncRes.success) {
          // Mark offline completed orders as synced
          for (const off of pendingOffline) {
            await markOfflineOrderSynced(off.id);
            syncedOfflineCount++;
          }

          // Mark held orders as synced
          for (const h of unsyncedHeld) {
            await markHeldOrderSynced(h.id, h.id);
            syncedHeldCount++;
          }
        }
      } catch (syncErr) {
        console.warn('[SyncEngine] Batch sync endpoint warning:', syncErr);
      }
    }

    // 2. Fetch latest remote held orders from backend to refresh local held store
    try {
      const queryParam = clientScopeId ? `?clientId=${encodeURIComponent(clientScopeId)}` : '';
      const remoteRes = await apiService.get(`/pos/orders/held${queryParam}`);
      if (remoteRes && remoteRes.success && Array.isArray(remoteRes.orders)) {
        remoteHeldOrders = remoteRes.orders;

        // Merge remote held orders into IndexedDB
        for (const remoteOrder of remoteHeldOrders) {
          const localId = remoteOrder.offlineOrderId || remoteOrder.orderId || remoteOrder._id;
          const mappedHeld: HeldOrder = {
            id: localId,
            clientId: clientScopeId || remoteOrder.clientId,
            serverOrderId: remoteOrder._id,
            reference: remoteOrder.reference || `HOLD-#${String(localId).slice(-4)}`,
            items: (remoteOrder.items || []).map((it: any) => ({
              productId: String(it.productId || it._id),
              barcode: it.barcode || '',
              name: it.name,
              unitPrice: Number(it.unitPrice || it.price) || 0,
              quantity: Number(it.quantity) || 1,
              gstRate: Number(it.gstRate) || 0,
              stockLevel: 99,
              imageUrl: it.image || it.imageUrl,
              category: it.category,
            })),
            subtotal: Number(remoteOrder.subtotal) || 0,
            discountAmount: Number(remoteOrder.discountAmount) || 0,
            totalGst: Number(remoteOrder.totalGst || remoteOrder.taxPrice) || 0,
            grandTotal: Number(remoteOrder.totalAmount || remoteOrder.grandTotal) || 0,
            totalAmount: Number(remoteOrder.totalAmount || remoteOrder.grandTotal) || 0,
            appliedCoupon: remoteOrder.couponCode
              ? { code: remoteOrder.couponCode, discount: remoteOrder.discountAmount || 0, minSubtotal: 0 }
              : null,
            customerName: remoteOrder.customerName,
            customerPhone: remoteOrder.customerPhone,
            status: 'HELD',
            createdAt: remoteOrder.createdAt || new Date().toISOString(),
            updatedAt: remoteOrder.updatedAt || new Date().toISOString(),
            isSynced: true,
          };
          await saveHeldOrder(mappedHeld, clientScopeId);
        }
      }
    } catch (fetchErr) {
      console.warn('[SyncEngine] Remote held orders fetch warning:', fetchErr);
    }
  } catch (err) {
    console.error('[SyncEngine] General sync error:', err);
  }

  return { syncedOfflineCount, syncedHeldCount, remoteHeldOrders };
}
