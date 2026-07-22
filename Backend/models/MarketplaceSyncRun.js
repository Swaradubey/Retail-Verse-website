const mongoose = require('mongoose');

const MarketplaceSyncRunSchema = new mongoose.Schema({
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
  marketplace: {
    type: String,
    default: 'shopify'
  },
  direction: {
    type: String,
    enum: ['export', 'import'],
    default: 'export'
  },
  status: {
    type: String,
    enum: ['queued', 'running', 'completed', 'partial', 'failed'],
    default: 'queued'
  },
  totalCount: { type: Number, default: 0 },
  queuedCount: { type: Number, default: 0 },
  activeCount: { type: Number, default: 0 },
  syncedCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  skippedCount: { type: Number, default: 0 },
  startedAt: { type: Date },
  completedAt: { type: Date },
  lastError: { type: String, default: '' },
  errors: [{
    productId: { type: mongoose.Schema.Types.ObjectId },
    productName: { type: String },
    sku: { type: String },
    error: { type: String }
  }],
  warnings: [{
    productId: { type: mongoose.Schema.Types.ObjectId },
    productName: { type: String },
    sku: { type: String },
    warning: { type: String }
  }]
}, { timestamps: true });

MarketplaceSyncRunSchema.index({ connectionId: 1, createdAt: -1 });
MarketplaceSyncRunSchema.index({ merchantId: 1, status: 1 });

module.exports = mongoose.model('MarketplaceSyncRun', MarketplaceSyncRunSchema);
