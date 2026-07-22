const mongoose = require('mongoose');

const MarketplaceSyncJobSchema = new mongoose.Schema({
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketplaceConnection',
    required: true
  },
  marketplaceConnectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketplaceConnection'
  },
  marketplace: {
    type: String,
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId
  },
  operation: {
    type: String,
    enum: [
      'CREATE_LISTING',
      'UPDATE_LISTING',
      'UPDATE_PRICE',
      'UPDATE_INVENTORY',
      'DELETE_LISTING',
      'IMPORT_PRODUCTS',
      'IMPORT_ORDERS',
      'FULL_SYNC',
      'IMPORT_PRODUCT_WEBHOOK',
      'IMPORT_INVENTORY_WEBHOOK'
    ],
    required: true
  },
  jobType: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'retrying', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: Number,
    default: 0
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 5
  },
  nextAttemptAt: {
    type: Date,
    default: Date.now
  },
  lockedAt: {
    type: Date
  },
  lockedBy: {
    type: String
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  result: {
    type: mongoose.Schema.Types.Mixed
  },
  error: {
    type: mongoose.Schema.Types.Mixed
  },
  idempotencyKey: {
    type: String,
    required: true,
    unique: true
  },
  completedAt: {
    type: Date
  },
  totalCount: { type: Number, default: 0 },
  processedCount: { type: Number, default: 0 },
  createdCount: { type: Number, default: 0 },
  updatedCount: { type: Number, default: 0 },
  skippedCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  startedAt: { type: Date },
  requestedBy: { type: String }
}, { timestamps: true });

MarketplaceSyncJobSchema.pre('save', function(next) {
  if (this.connectionId && !this.marketplaceConnectionId) {
    this.marketplaceConnectionId = this.connectionId;
  } else if (this.marketplaceConnectionId && !this.connectionId) {
    this.connectionId = this.marketplaceConnectionId;
  }
  if (this.operation && !this.jobType) {
    this.jobType = this.operation;
  } else if (this.jobType && !this.operation) {
    this.operation = this.jobType;
  }
  next();
});

MarketplaceSyncJobSchema.index({ status: 1, nextAttemptAt: 1, lockedAt: 1 });
MarketplaceSyncJobSchema.index({ idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.model('MarketplaceSyncJob', MarketplaceSyncJobSchema);
