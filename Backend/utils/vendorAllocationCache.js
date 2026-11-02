/**
 * In-memory high-performance TTL cache for Vendor Allocations & Read-Receipt Tracker
 * Supports sub-millisecond retrieval for Admin Tracker and Vendor Dashboard.
 * Automatically invalidated upon any mutation (allocation creation, status update, seen receipt, stock credit, deletion).
 */

class VendorAllocationCache {
  constructor(defaultTtlMs = 30 * 1000) {
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = 500;
    this.hits = 0;
    this.misses = 0;
  }

  generateAdminKey(clientId, params = {}) {
    const cId = clientId ? String(clientId) : 'all';
    const page = params.page || 1;
    const limit = params.limit || 10;
    const status = params.status || 'ALL';
    const search = params.search ? String(params.search).trim().toLowerCase() : '';
    const productId = params.productId ? String(params.productId) : '';
    const isSeen = params.isSeen !== undefined ? String(params.isSeen) : '';
    return `admin:${cId}:p${page}:l${limit}:s${status}:q${search}:prod${productId}:seen${isSeen}`;
  }

  generateVendorKey(vendorId, params = {}) {
    const vId = vendorId ? String(vendorId) : 'unknown';
    const page = params.page || 1;
    const limit = params.limit || 10;
    const status = params.status || 'ALL';
    const search = params.search ? String(params.search).trim().toLowerCase() : '';
    const isSeen = params.isSeen !== undefined ? String(params.isSeen) : '';
    return `vendor:${vId}:p${page}:l${limit}:s${status}:q${search}:seen${isSeen}`;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      this.misses++;
      return null;
    }

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return item.data;
  }

  set(key, data, ttlMs = this.defaultTtlMs) {
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  invalidate() {
    const count = this.cache.size;
    this.cache.clear();
    if (count > 0) {
      console.log(`[VendorAllocationCache] Invalidated cache (${count} entries cleared)`);
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
    };
  }
}

const vendorAllocationCache = new VendorAllocationCache(30 * 1000); // 30s TTL

module.exports = vendorAllocationCache;

