/**
 * In-memory high-performance cache for User Settings queries.
 * Provides sub-millisecond (<1ms) response times for settings page loading.
 */

class SettingsCache {
  constructor(defaultTtlMs = 180 * 1000) { // 3 minutes default TTL
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
    this.hits = 0;
    this.misses = 0;
  }

  get(userId) {
    if (!userId) return null;
    const key = String(userId);
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

  set(userId, data, ttlMs = this.defaultTtlMs) {
    if (!userId) return;
    const key = String(userId);

    // Evict oldest entry if cache exceeds 1000 active users
    if (this.cache.size > 1000) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  invalidate(userId) {
    if (!userId) return;
    this.cache.delete(String(userId));
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

const settingsCache = new SettingsCache(180 * 1000);

module.exports = settingsCache;
