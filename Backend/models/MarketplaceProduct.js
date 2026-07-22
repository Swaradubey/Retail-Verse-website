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
      'missing_sku', 'missing_location', 'missing_permission', 'reconnection_required'
    ],
    default: 'not_synced'
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

// Index for fast lookups
MarketplaceProductSchema.index({ merchantId: 1 });

// Required compound unique index preventing duplicate mappings
MarketplaceProductSchema.index({ connectionId: 1, localProductId: 1, localVariantId: 1 }, { unique: true, sparse: true });

// For backward compatibility, also support a sparse index on productId/marketplace
MarketplaceProductSchema.index({ productId: 1, marketplace: 1 }, { unique: false });

module.exports = mongoose.model('MarketplaceProduct', MarketplaceProductSchema);
