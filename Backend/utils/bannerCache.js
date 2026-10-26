/**
 * In-memory high-performance cache for Promotional Banner queries.
 * Provides sub-millisecond (<1ms) response times for active storefront banners and admin listings.
 */

class BannerCache {
  constructor(defaultTtlMs = 120 * 1000) { // 2 minutes default TTL
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
    this.hits = 0;
    this.misses = 0;
  }

  generateKey(placement = "all", isAdmin = false) {
    return isAdmin ? `banners:admin:${placement}` : `banners:active:${placement}`;
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
    // Prevent memory leaks: evict oldest entry if size exceeds 500
    if (this.cache.size > 500) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  invalidate(key) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  invalidateAll() {
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

const bannerCache = new BannerCache(120 * 1000);

module.exports = bannerCache;
