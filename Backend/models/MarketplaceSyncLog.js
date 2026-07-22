const mongoose = require('mongoose');

const MarketplaceSyncLogSchema = new mongoose.Schema({
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
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  retailVerseProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  retailVerseVariantId: {
    type: mongoose.Schema.Types.ObjectId
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketplaceSyncJob'
  },
  syncJobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketplaceSyncJob'
  },
  action: {
    type: String,
    required: true
  },
  level: {
    type: String,
    enum: ['info', 'warn', 'error'],
    default: 'info'
  },
  message: {
    type: String,
    required: true
  },
  requestSummary: {
    type: mongoose.Schema.Types.Mixed
  },
  responseSummary: {
    type: mongoose.Schema.Types.Mixed
  },
  statusCode: {
    type: Number
  },
  durationMs: {
    type: Number
  },
  marketplaceConnectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketplaceConnection'
  },
  sellerSku: {
    type: String
  },
  flipkartFsn: {
    type: String
  },
  status: {
    type: String
  },
  errorCode: {
    type: String
  },
  errorMessage: {
    type: String
  },
  retryCount: {
    type: Number,
    default: 0
  }
}, { timestamps: { createdAt: true, updatedAt: false } });

MarketplaceSyncLogSchema.pre('save', function(next) {
  if (this.jobId && !this.syncJobId) {
    this.syncJobId = this.jobId;
  } else if (this.syncJobId && !this.jobId) {
    this.jobId = this.syncJobId;
  }
  if (this.connectionId && !this.marketplaceConnectionId) {
    this.marketplaceConnectionId = this.connectionId;
  } else if (this.marketplaceConnectionId && !this.connectionId) {
    this.connectionId = this.marketplaceConnectionId;
  }
  if (this.productId && !this.retailVerseProductId) {
    this.retailVerseProductId = this.productId;
  } else if (this.retailVerseProductId && !this.productId) {
    this.productId = this.retailVerseProductId;
  }
  next();
});

MarketplaceSyncLogSchema.index({ connectionId: 1, createdAt: -1 });

module.exports = mongoose.model('MarketplaceSyncLog', MarketplaceSyncLogSchema);
