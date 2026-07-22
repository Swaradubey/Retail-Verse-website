const mongoose = require('mongoose');

const MarketplaceProductMappingSchema = new mongoose.Schema({
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  marketplace: {
    type: String,
    enum: ['shopify', 'flipkart', 'amazon'],
    default: 'flipkart'
  },
  marketplaceConnectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketplaceConnection',
    required: true,
  },
  retailVerseProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  retailVerseVariantId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  sellerSku: {
    type: String,
    required: true,
    trim: true,
  },
  flipkartFsn: {
    type: String,
    default: '',
    trim: true,
  },
  flipkartListingId: {
    type: String,
    default: '',
    trim: true,
  },
  flipkartLocationId: {
    type: String,
    default: '',
    trim: true,
  },
  categoryId: {
    type: String,
    default: '',
    trim: true,
  },
  mappingStatus: {
    type: String,
    enum: [
      'READY',
      'NEEDS_FSN_MAPPING',
      'MISSING_REQUIRED_FIELDS',
      'INVALID_PRICE',
      'INVALID_STOCK',
      'CATEGORY_APPROVAL_REQUIRED',
      'READY_TO_SYNC',
      'SYNCED',
      'FAILED',
      'UNMAPPED',
      'MAPPED',
      'MAPPING_REQUIRED',
      'INVALID_BARCODE',
      'AWAITING_MARKETPLACE_APPROVAL'
    ],
    default: 'UNMAPPED',
  },
  listingStatus: {
    type: String,
    enum: [
      'ACTIVE', 'INACTIVE', 'DRAFT', 'NEEDS_APPROVAL',
      'NOT_SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'UNKNOWN'
    ],
    default: 'NOT_SUBMITTED',
  },
  lastSyncedPrice: {
    type: Number,
    default: null,
  },
  lastSyncedStock: {
    type: Number,
    default: null,
  },
  lastSyncedAt: {
    type: Date,
    default: null,
  },
  syncVersion: {
    type: Number,
    default: 1,
  },
  blinkitSku: { type: String, default: '', trim: true },
  blinkitProductId: { type: String, default: '', trim: true },
  blinkitLocationId: { type: String, default: '', trim: true },
  syncEnabled: { type: Boolean, default: false },
  lastSyncedQuantity: { type: Number, default: null },
  lastErrorCode: {
    type: String,
    default: '',
  },
  lastErrorMessage: {
    type: String,
    default: '',
  }
}, {
  timestamps: true,
});

// Compound unique indexes to prevent duplicate mappings
MarketplaceProductMappingSchema.index(
  { marketplaceConnectionId: 1, retailVerseVariantId: 1 },
  { unique: true, sparse: true }
);

MarketplaceProductMappingSchema.index(
  { marketplaceConnectionId: 1, sellerSku: 1 },
  { unique: true }
);

module.exports = mongoose.model('MarketplaceProductMapping', MarketplaceProductMappingSchema);
