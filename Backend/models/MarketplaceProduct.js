const mongoose = require('mongoose');

const MarketplaceProductSchema = new mongoose.Schema({
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketplaceConnection'
  },
  marketplaceAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketplaceConnection'
  },
  shopDomain: {
    type: String
  },
  marketplace: {
    type: String,
    enum: ['amazon', 'flipkart', 'shopify'],
    required: true
  },
  marketplaceProductId: {
    type: String,
    default: ''
  },
  localProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  localVariantId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  shopifyProductId: {
    type: String
  },
  shopifyVariantId: {
    type: String
  },
  shopifyInventoryItemId: {
    type: String
  },
  inventoryItemId: {
    type: String
  },
  locationId: {
    type: String
  },
  shopifyLocationId: {
    type: String
  },
  listingStatus: {
    type: String,
    enum: ['active', 'draft', 'archived', 'failed', 'pending'],
    default: 'pending'
  },
  syncStatus: {
    type: String,
    enum: [
      'not_synced', 'queued', 'syncing', 'synced', 'success', 'failed',
      'product_synced', 'inventory_synced', 'inventory_sync_failed',
      'missing_sku', 'missing_location', 'missing_permission', 'reconnection_required',
      'Pending', 'Processing', 'Synced', 'Failed', 'StaleSkipped'
    ],
    default: 'not_synced'
  },
  requestedQuantity: {
    type: Number,
    default: null
  },
  previousShopifyQuantity: {
    type: Number,
    default: null
  },
  finalShopifyQuantity: {
    type: Number,
    default: null
  },
  status: {
    type: String,
    default: 'Pending'
  },
  attemptCount: {
    type: Number,
    default: 0
  },
  lastAttemptAt: {
    type: Date,
    default: null
  },
  errorCode: {
    type: String,
    default: ''
  },
  errorMessage: {
    type: String,
    default: ''
  },
  syncError: {
    type: String,
    default: ''
  },
  lastError: {
    type: String,
    default: ''
  },
  lastSyncedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Pre-save hook to synchronize redundant/alias fields across legacy schemas
MarketplaceProductSchema.pre('save', function (next) {
  if (this.localProductId && !this.productId) {
    this.productId = this.localProductId;
  } else if (this.productId && !this.localProductId) {
    this.localProductId = this.productId;
  }

  if (this.connectionId && !this.marketplaceAccountId) {
    this.marketplaceAccountId = this.connectionId;
  } else if (this.marketplaceAccountId && !this.connectionId) {
    this.connectionId = this.marketplaceAccountId;
  }

  if (this.shopifyProductId && !this.marketplaceProductId) {
    this.marketplaceProductId = this.shopifyProductId;
  } else if (this.marketplaceProductId && !this.shopifyProductId) {
    this.shopifyProductId = this.marketplaceProductId;
  }

  if (this.inventoryItemId && !this.shopifyInventoryItemId) {
    this.shopifyInventoryItemId = this.inventoryItemId;
  } else if (this.shopifyInventoryItemId && !this.inventoryItemId) {
    this.inventoryItemId = this.shopifyInventoryItemId;
  }

  if (this.locationId && !this.shopifyLocationId) {
    this.shopifyLocationId = this.locationId;
  } else if (this.shopifyLocationId && !this.locationId) {
    this.locationId = this.shopifyLocationId;
  }

  if (this.syncError && !this.lastError) {
    this.lastError = this.syncError;
  } else if (this.lastError && !this.syncError) {
    this.syncError = this.lastError;
  }

  next();
});

// Indexes for fast lookups
MarketplaceProductSchema.index({ merchantId: 1 });
MarketplaceProductSchema.index({ connectionId: 1, localProductId: 1 }, { unique: true, sparse: true });
MarketplaceProductSchema.index({ shopifyProductId: 1 }, { sparse: true });
MarketplaceProductSchema.index({ productId: 1, marketplace: 1 }, { unique: false });

module.exports = mongoose.model('MarketplaceProduct', MarketplaceProductSchema);

