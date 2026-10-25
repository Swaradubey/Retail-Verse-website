/**
 * In-memory high-performance cache for Product queries
 * Provides sub-millisecond responses for repeated product listings and details.
 */

class ProductCache {
  constructor(defaultTtlMs = 60 * 1000) {
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Generates a stable cache key based on query params, tenant/client, and role
   */
  generateKey(req, prefix = "products") {
    const url = req.originalUrl || req.url || "";
    const clientId = req.headers["x-client-id"] || req.query?.clientId || req.user?.clientId || "global";
    const role = req.user?.role || "public";
    return `${prefix}:${role}:${clientId}:${url}`;
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
    // Prevent unbounded memory growth: keep max 1000 entries
    if (this.cache.size > 1000) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Clears all cached product data when any product is created, updated, or deleted
   */
  invalidate() {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
    };
  }
}

const productCache = new ProductCache(60 * 1000); // 60s TTL

module.exports = productCache;
