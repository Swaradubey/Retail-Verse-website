const MarketplaceSyncJob = require("../models/MarketplaceSyncJob");
const MarketplaceConnection = require("../models/MarketplaceConnection");
const { v4: uuidv4 } = require("uuid"); // Ensure uuid is installed or generate a random string

class MarketplaceSyncJobService {
  /**
   * Create a new sync job
   */
  static async createJob({ merchantId, productId, marketplace, operation = "CREATE_LISTING", payload = {} }) {
    // Try to find connection with merchantId fallback
    let connection = await MarketplaceConnection.findOne({
      merchantId,
      marketplace,
      status: "connected",
      isSyncEnabled: true
    });

    if (!connection) {
      // Search by connectionId if passed in payload as fallback
      if (payload.connectionId) {
        connection = await MarketplaceConnection.findOne({
          _id: payload.connectionId,
          marketplace,
          status: "connected"
        });
      }
    }

    if (!connection) {
      console.log(`[MarketplaceSyncJobService] No active connection found for ${marketplace} (merchant: ${merchantId}). Skipping job.`);
      return null; // Don't create a job if disconnected
    }

    // Map legacy 'create_product' to 'CREATE_LISTING'
    let op = operation;
    if (op === 'create_product') op = 'CREATE_LISTING';
    if (op === 'update_product') op = 'UPDATE_LISTING';

    // Prevent duplicate pending/processing/retrying jobs
    const matchQuery = {
      merchantId,
      marketplace,
      operation: op,
      status: { $in: ['pending', 'processing', 'retrying'] }
    };
    if (productId) {
      matchQuery.productId = productId;
    } else if (payload.body?.id || payload.id) {
      matchQuery['payload.body.id'] = payload.body?.id || payload.id;
    }

    const existingJob = await MarketplaceSyncJob.findOne(matchQuery);
    if (existingJob) {
      console.log(`[MarketplaceSyncJobService] Active job already exists for ${op} (product/target: ${productId || 'webhook'}). Skipping duplicate.`);
      return existingJob;
    }

    const idempotencyKey = `job-${merchantId}-${productId || 'none'}-${marketplace}-${op}-${Date.now()}`;

    const job = new MarketplaceSyncJob({
      merchantId,
      connectionId: connection._id,
      productId,
      marketplace,
      operation: op,
      payload,
      idempotencyKey,
      status: "pending",
      nextAttemptAt: new Date(),
      attempts: 0
    });
    
    await job.save();
    return job;
  }

  /**
   * Release locks on stale processing jobs (older than 15 minutes)
   */
  static async releaseStaleLocks() {
    const timeLimit = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
    const result = await MarketplaceSyncJob.updateMany(
      { status: "processing", lockedAt: { $lt: timeLimit } },
      { $set: { status: "pending", lockedAt: null, lockedBy: null } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[MarketplaceSyncJobService] Released ${result.modifiedCount} stale job locks.`);
    }
  }

  /**
   * Delegates polling and processing of pending jobs to MarketplaceJobWorker
   */
  static async processPendingJobs() {
    const MarketplaceJobWorker = require("./marketplaces/MarketplaceJobWorker");
    await MarketplaceJobWorker.poll();
  }

  /**
   * For backwards compatibility with controllers that still call this.
   * We do NOT process synchronously anymore, as the worker handles it.
   */
  static async processJob(jobId) {
    // No-op to prevent blocking API response
    // The MarketplaceJobWorker will pick this up automatically.
    return;
  }
}

module.exports = MarketplaceSyncJobService;
