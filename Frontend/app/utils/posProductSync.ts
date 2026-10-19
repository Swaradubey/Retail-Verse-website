import { upsertPosProductCache } from '../lib/posProductCache';
import { upsertCachedProduct } from '../services/posIndexedDB';

export const POS_PRODUCT_SYNC_CHANNEL = 'pos_product_sync';
export const POS_PRODUCT_SYNC_EVENT = 'pos_product_sync';

export interface ProductSyncPayload {
  type: 'PRODUCT_CREATED' | 'PRODUCT_UPDATED';
  product: any;
  clientId?: string;
  timestamp: number;
}

/**
 * Broadcasts product addition/update instantly across all tabs & local windows.
 * Immediately upserts to IndexedDB & local cache for offline/instant availability.
 */
export function broadcastProductSync(product: any, clientId?: string): void {
  if (!product) return;

  const resolvedClientId =
    (clientId ||
      product.clientId ||
      (typeof product.client === 'string' ? product.client : product.client?._id) ||
      localStorage.getItem('retail_verse_client_id') ||
      '') as string;

  const payload: ProductSyncPayload = {
    type: 'PRODUCT_CREATED',
    product: {
      ...product,
      clientId: resolvedClientId,
    },
    clientId: resolvedClientId,
    timestamp: Date.now(),
  };

  // 1. Immediately upsert into IndexedDB stores without waiting for full catalog refetch
  void upsertCachedProduct(payload.product, resolvedClientId);
  void upsertPosProductCache(payload.product, resolvedClientId);

  // 2. Broadcast via BroadcastChannel (multi-tab / multi-window support)
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(POS_PRODUCT_SYNC_CHANNEL);
      channel.postMessage(payload);
      channel.close();
    }
  } catch (e) {
    console.warn('[posProductSync] BroadcastChannel error:', e);
  }

  // 3. Dispatch window CustomEvents (same-tab immediate notification)
  try {
    window.dispatchEvent(
      new CustomEvent(POS_PRODUCT_SYNC_EVENT, { detail: payload })
    );
    window.dispatchEvent(
      new CustomEvent('retailverse-product-updated', {
        detail: { product: payload.product, clientId: resolvedClientId },
      })
    );
  } catch (e) {
    console.warn('[posProductSync] CustomEvent dispatch error:', e);
  }
}

/**
 * Listener for POS Catalog components to receive instant product updates without refetching all items.
 */
export function subscribeToProductSync(
  callback: (product: any, clientId?: string) => void,
  activeClientId?: string
): () => void {
  let channel: BroadcastChannel | null = null;

  const handleMessage = (payload: ProductSyncPayload) => {
    if (!payload || !payload.product) return;

    // Strict client isolation check
    const currentActiveClient = String(
      activeClientId || localStorage.getItem('retail_verse_client_id') || ''
    ).trim();

    const incomingClientId = String(payload.clientId || payload.product?.clientId || '').trim();

    // If both active and incoming clientIds exist and don't match, discard to enforce tenant isolation
    if (currentActiveClient && incomingClientId && currentActiveClient !== incomingClientId) {
      return;
    }

    callback(payload.product, incomingClientId || currentActiveClient);
  };

  // 1. Listen via BroadcastChannel
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(POS_PRODUCT_SYNC_CHANNEL);
      channel.onmessage = (event: MessageEvent<ProductSyncPayload>) => {
        handleMessage(event.data);
      };
    }
  } catch (e) {
    console.warn('[posProductSync] BroadcastChannel init error:', e);
  }

  // 2. Listen via window CustomEvents
  const handleCustomEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.product) {
      handleMessage(detail);
    }
  };

  const handleLegacyEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.product) {
      handleMessage({
        type: 'PRODUCT_CREATED',
        product: detail.product,
        clientId: detail.clientId || detail.product?.clientId,
        timestamp: Date.now(),
      });
    }
  };

  window.addEventListener(POS_PRODUCT_SYNC_EVENT, handleCustomEvent);
  window.addEventListener('retailverse-product-updated', handleLegacyEvent);

  return () => {
    if (channel) {
      try {
        channel.close();
      } catch {}
    }
    window.removeEventListener(POS_PRODUCT_SYNC_EVENT, handleCustomEvent);
    window.removeEventListener('retailverse-product-updated', handleLegacyEvent);
  };
}
