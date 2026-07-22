const mongoose = require('mongoose');

const MarketplaceListingSchema = new mongoose.Schema({
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
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    // ref: 'Variant' if applicable
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
  sellerAccountId: {
    type: String
  },
  marketplaceProductId: {
    type: String
  },
  marketplaceListingId: {
    type: String
  },
  marketplaceSku: {
    type: String
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'publishing', 'active', 'rejected', 'action_required', 'paused', 'archived', 'deleted'],
    default: 'draft'
  },
  syncStatus: {
    type: String,
    enum: ['pending', 'syncing', 'success', 'failed'],
    default: 'pending'
  },
  approvalStatus: {
    type: String,
    enum: ['approved', 'rejected', 'pending_approval'],
  },
  listingUrl: {
    type: String
  },
  publishedPrice: {
    type: Number
  },
  publishedQuantity: {
    type: Number
  },
  lastSyncedVersion: {
    type: String
  },
  lastSyncedAt: {
    type: Date
  },
  lastError: {
    type: String
  },
  missingFields: [{
    type: String
  }],
  marketplaceResponse: {
    type: mongoose.Schema.Types.Mixed
  }
}, { timestamps: true });

MarketplaceListingSchema.index({ merchantId: 1 });
MarketplaceListingSchema.index({ productId: 1, connectionId: 1 }, { unique: true });

module.exports = mongoose.model('MarketplaceListing', MarketplaceListingSchema);
