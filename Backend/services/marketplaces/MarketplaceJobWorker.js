const mongoose = require('mongoose');
const MarketplaceSyncJob = require('../../models/MarketplaceSyncJob');
const MarketplaceListing = require('../../models/MarketplaceListing');
const MarketplaceSyncLog = require('../../models/MarketplaceSyncLog');
const MarketplaceConnection = require('../../models/MarketplaceConnection');
const Product = require('../../models/Product');

const AmazonMarketplaceAdapter = require('./adapters/amazon.adapter');
const ShopifyMarketplaceAdapter = require('./adapters/shopify.adapter');
const FlipkartMarketplaceAdapter = require('./adapters/flipkart.adapter');

class MarketplaceJobWorker {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.intervalMs = parseInt(process.env.MARKETPLACE_WORKER_INTERVAL_MS, 10) || 10000;
    this.maxAttempts = parseInt(process.env.MARKETPLACE_JOB_MAX_ATTEMPTS, 10) || 5;
    this.workerId = 'worker-' + Math.random().toString(36).substr(2, 9);
  }

  start() {
    if (process.env.MARKETPLACE_WORKER_ENABLED !== 'true') {
      console.log('[MarketplaceJobWorker] Worker is disabled by env var MARKETPLACE_WORKER_ENABLED');
      return;
    }
    
    if (this.intervalId) return;
    
    console.log(`[MarketplaceJobWorker] Starting worker ${this.workerId} with interval ${this.intervalMs}ms`);
    this.intervalId = setInterval(() => this.poll(), this.intervalMs);
    // initial poll
    this.poll();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`[MarketplaceJobWorker] Stopped worker ${this.workerId}`);
    }
  }

  async poll() {
    if (this.isRunning) return; // Prevent concurrent polling cycles
    this.isRunning = true;

    try {
      // Find a pending job
      const now = new Date();
      const job = await MarketplaceSyncJob.findOneAndUpdate(
        {
          status: { $in: ['pending', 'retrying'] },
          nextAttemptAt: { $lte: now }
        },
        {
          $set: {
            status: 'processing',
            lockedAt: now,
            lockedBy: this.workerId
          }
        },
        { sort: { priority: -1, nextAttemptAt: 1 }, new: true }
      );

      if (!job) {
        this.isRunning = false;
        return; // No jobs to process
      }

      await this.processJob(job);
      
      // Immediately poll again in case there are more jobs
      this.isRunning = false;
      setImmediate(() => this.poll());
    } catch (err) {
      console.error('[MarketplaceJobWorker] Polling error:', err);
      this.isRunning = false;
    }
  }

  async processJob(job) {
    try {
      const connection = await MarketplaceConnection.findById(job.connectionId);
      if (!connection) throw new Error('Connection not found');

      const adapter = this.getAdapter(connection.marketplace, connection);
      if (!adapter) throw new Error(`Adapter for ${connection.marketplace} not found`);

      const product = await Product.findById(job.productId).lean();
      
      let result;
      switch (job.operation) {
        case 'CREATE_LISTING':
          if (!product) throw new Error('Product not found');
          result = await adapter.createListing(product);
          await this.updateListingStatus(job, result, 'active');
          break;
        case 'UPDATE_LISTING':
          if (!product) throw new Error('Product not found');
          result = await adapter.updateListing(product);
          break;
        case 'UPDATE_INVENTORY':
          if (!product) throw new Error('Product not found');
          result = await adapter.updateInventory(product);
          break;
        case 'UPDATE_PRICE':
          if (!product) throw new Error('Product not found');
          result = await adapter.updatePrice(product);
          break;
        case 'DELETE_LISTING':
          if (!product) throw new Error('Product not found');
          result = await adapter.deleteListing(product);
          await this.updateListingStatus(job, result, 'deleted');
          break;
        case 'IMPORT_PRODUCT_WEBHOOK':
          if (typeof adapter.handleProductWebhook === 'function') {
            result = await adapter.handleProductWebhook(job.payload);
          } else {
            throw new Error('handleProductWebhook not implemented on adapter');
          }
          break;
        case 'IMPORT_INVENTORY_WEBHOOK':
          if (typeof adapter.handleInventoryWebhook === 'function') {
            result = await adapter.handleInventoryWebhook(job.payload);
          } else {
            throw new Error('handleInventoryWebhook not implemented on adapter');
          }
          break;
        default:
          throw new Error('Unsupported operation');
      }

      // Mark completed
      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date();
      await job.save();

      await this.logActivity(job, 'info', 'Job completed successfully');
      
    } catch (err) {
      console.error(`[MarketplaceJobWorker] Job ${job._id} failed:`, err);
      job.error = { message: err.message, stack: err.stack };

      // Helper function to check retry eligibility
      const isRetryableError = (error) => {
        if (!error || !error.message) return true;
        const msg = error.message.toLowerCase();
        if (msg.includes('scope') || msg.includes('permission') || msg.includes('access scope')) return false;
        if (msg.includes('unauthorized') || msg.includes('access token') || msg.includes('invalid token') || msg.includes('invalid access token')) return false;
        if (msg.includes('user errors') || msg.includes('usererror') || msg.includes('validation')) return false;
        if (msg.includes('location') || msg.includes('invalid location') || msg.includes('location not found')) return false;
        if (msg.includes('disconnected') || msg.includes('not connected')) return false;
        if (msg.includes('not found') || msg.includes('does not exist')) return false;
        return true;
      };

      if (err.isThrottle) {
        // Shopify Rate Limiting: delay and reschedule without consuming attempts count
        job.status = 'retrying';
        const delayMs = Number(err.retryAfterMs) || 10000;
        job.nextAttemptAt = new Date(Date.now() + delayMs);
        await this.logActivity(job, 'warn', `Job throttled. Rescheduling in ${delayMs}ms. Error: ${err.message}`);
      } else if (!isRetryableError(err)) {
        // Non-retryable permanent error: fail immediately
        job.status = 'failed';
        await this.logActivity(job, 'error', `Job failed permanently (non-retryable error): ${err.message}`);
        await this.updateListingStatus(job, null, 'failed', err.message);
      } else {
        // Regular retryable error
        job.attempts += 1;
        if (job.attempts >= this.maxAttempts) {
          job.status = 'failed';
          await this.logActivity(job, 'error', `Job failed permanently after ${job.attempts} attempts: ${err.message}`);
          await this.updateListingStatus(job, null, 'failed', err.message);
        } else {
          job.status = 'retrying';
          // Exponential backoff
          const delays = [60000, 300000, 900000, 3600000]; // 1m, 5m, 15m, 1h
          const delayMs = delays[job.attempts - 1] || delays[delays.length - 1];
          job.nextAttemptAt = new Date(Date.now() + delayMs);
          await this.logActivity(job, 'warn', `Job failed (attempt ${job.attempts}): ${err.message}. Retrying at ${job.nextAttemptAt}`);
        }
      }
      
      await job.save();
    }
  }

  async updateListingStatus(job, result, status, errorMsg = null) {
    if (!job.productId) return;
    
    const update = {
      syncStatus: status === 'failed' ? 'failed' : 'success',
      status: status !== 'failed' ? status : undefined,
      lastSyncedAt: new Date(),
      lastError: errorMsg || ''
    };
    
    if (result && result.listingId) {
      update.marketplaceListingId = result.listingId;
    }

    // Clean up undefined fields
    Object.keys(update).forEach(key => update[key] === undefined && delete update[key]);

    await MarketplaceListing.findOneAndUpdate(
      { merchantId: job.merchantId, productId: job.productId, connectionId: job.connectionId },
      { $set: update },
      { upsert: true, new: true }
    );

    // Also update MarketplaceProduct mapping on failure
    if (status === 'failed') {
      await MarketplaceProduct.findOneAndUpdate(
        { connectionId: job.connectionId, localProductId: job.productId },
        {
          $set: {
            syncStatus: 'failed',
            lastError: errorMsg || '',
            lastSyncedAt: new Date()
          }
        }
      ).catch(err => {
        console.error(`[MarketplaceJobWorker] Failed to update MarketplaceProduct syncStatus on failure:`, err.message);
      });
    }
  }

  async logActivity(job, level, message) {
    await MarketplaceSyncLog.create({
      merchantId: job.merchantId,
      connectionId: job.connectionId,
      marketplace: job.marketplace,
      productId: job.productId,
      jobId: job._id,
      action: job.operation,
      level,
      message,
      durationMs: Date.now() - (job.lockedAt ? job.lockedAt.getTime() : Date.now())
    });
  }

  getAdapter(marketplace, connection) {
    switch (marketplace ? marketplace.toLowerCase() : '') {
      case 'amazon': return new AmazonMarketplaceAdapter(connection);
      case 'shopify': return new ShopifyMarketplaceAdapter(connection);
      case 'flipkart': return new FlipkartMarketplaceAdapter(connection);
      default: return null;
    }
  }
}

// Singleton instance
const worker = new MarketplaceJobWorker();
module.exports = worker;
