const mongoose = require('mongoose');

const MarketplaceConnectionSchema = new mongoose.Schema({
  // New standardized client field
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  // Legacy merchantId retained for Shopify & backward compatibility
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  // Standardized channel field
  channel: {
    type: String,
    enum: ['flipkart', 'amazon', 'meesho', 'swiggy', 'myntra', 'shopify'],
    index: true,
  },
  // Legacy marketplace field
  marketplace: {
    type: String,
    enum: ['flipkart', 'amazon', 'meesho', 'swiggy', 'myntra', 'shopify', 'FLIPKART'],
  },
  sellerId: {
    type: String,
    default: ''
  },
  integrationMode: {
    type: String,
    enum: ['DIRECT_API', 'INTEGRATION_PARTNER', 'SELF_ACCESS', 'THIRD_PARTY_OAUTH'],
    default: null
  },
  vendorId: { type: String, default: '' },
  apiBaseUrl: { type: String, default: '' },
  defaultLocationId: { type: String, default: '' },
  partnerName: { type: String, default: '' },
  partnerApiBaseUrl: { type: String, default: '' },
  partnerAccountId: { type: String, default: '' },
  accountName: {
    type: String,
  },
  sellerAccountId: {
    type: String,
  },
  storeUrl: {
    type: String,
  },
  // Unified status supporting both uppercase standard enum and lowercase legacy states
  status: {
    type: String,
    enum: [
      'CONNECTED',
      'DISCONNECTED',
      'FAILED',
      'SYNCING',
      'connected',
      'disconnected',
      'connecting',
      'token_expired',
      'connection_error',
      'approval_required',
      'sync_paused',
      'configuration_missing'
    ],
    default: 'DISCONNECTED',
    index: true,
  },
  autoSync: {
    type: Boolean,
    default: true,
  },
  isSyncEnabled: {
    type: Boolean,
    default: false,
  },
  // Credentials object including accessToken, refreshToken, tokenExpiresAt
  credentials: {
    accessToken: { type: String, default: '' },
    refreshToken: { type: String, default: '' },
    tokenExpiresAt: { type: Date },
    // Legacy encrypted fields
    encryptedAccessToken: { type: String },
    encryptedRefreshToken: { type: String },
    encryptedConsumerKey: { type: String },
    encryptedConsumerSecret: { type: String },
    iv: { type: String },
    authTag: { type: String }
  },
  syncStats: {
    totalProducts: { type: Number, default: 0 },
    syncedProducts: { type: Number, default: 0 },
    failedProducts: { type: Number, default: 0 }
  },
  metadata: {
    shopName: { type: String },
    marketplaceRegion: { type: String },
    locationId: { type: String },
    scopes: [{ type: String }],
    tokenExpiresAt: { type: Date }
  },
  apiHealth: {
    type: {
      status: {
        type: String,
        enum: ['unknown', 'healthy', 'warning', 'error'],
        default: 'unknown'
      },
      lastCheckedAt: { type: Date },
      lastSuccessAt: { type: Date },
      lastError: { type: String }
    }
  },
  lastSyncAt: { type: Date },
  connectedAt: { type: Date },
  disconnectedAt: { type: Date },
  shopDomain: { type: String },
  accessToken: { type: String },
  installedAt: { type: Date, default: Date.now },
  syncSettings: {
    orders: { type: Boolean, default: true },
    inventory: { type: Boolean, default: true },
    products: { type: Boolean, default: true },
    pricing: { type: Boolean, default: true }
  },
  accountLabel: {
    type: String
  },
  applicationMode: {
    type: String,
    enum: ['SELF_ACCESS', 'THIRD_PARTY_OAUTH'],
    default: 'THIRD_PARTY_OAUTH'
  },
  accessTokenExpiresAt: {
    type: Date
  },
  refreshTokenExpiresAt: {
    type: Date
  },
  connectionStatus: {
    type: String,
    default: 'DISCONNECTED'
  },
  apiHealthStatus: {
    type: String,
    default: 'UNKNOWN'
  },
  lastHealthCheckAt: {
    type: Date
  },
  lastSuccessfulSyncAt: {
    type: Date
  },
  lastErrorCode: {
    type: String
  },
  lastErrorMessage: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save synchronization hook between legacy & new standardized fields
MarketplaceConnectionSchema.pre('save', function (next) {
  if (!this.merchantId && this.clientId) {
    this.merchantId = this.clientId;
  }
  if (!this.clientId && this.merchantId) {
    this.clientId = this.merchantId;
  }
  if (!this.marketplace && this.channel) {
    this.marketplace = this.channel;
  }
  if (!this.channel && this.marketplace) {
    this.channel = this.marketplace.toLowerCase();
  }
  if (!this.sellerId && this.sellerAccountId) {
    this.sellerId = this.sellerAccountId;
  }
  if (!this.sellerAccountId && this.sellerId) {
    this.sellerAccountId = this.sellerId;
  }
  // Keep credentials.accessToken in sync with top-level accessToken if present
  if (this.credentials?.accessToken && !this.accessToken) {
    this.accessToken = this.credentials.accessToken;
  }
  if (this.accessToken && !this.credentials?.accessToken) {
    if (!this.credentials) this.credentials = {};
    this.credentials.accessToken = this.accessToken;
  }
  next();
});

// Indexes
MarketplaceConnectionSchema.index({ clientId: 1, channel: 1 });
MarketplaceConnectionSchema.index({ merchantId: 1, marketplace: 1, sellerAccountId: 1 }, { unique: true, sparse: true });

// Retaining virtuals for backwards compatibility
MarketplaceConnectionSchema.virtual('sellerAccountName').get(function() {
  return this.accountName || '';
}).set(function(val) {
  this.accountName = val;
});

MarketplaceConnectionSchema.virtual('encryptedAccessToken').get(function() {
  return this.credentials?.encryptedAccessToken || '';
}).set(function(val) {
  this.credentials = this.credentials || {};
  this.credentials.encryptedAccessToken = val;
});

MarketplaceConnectionSchema.virtual('encryptedRefreshToken').get(function() {
  return this.credentials?.encryptedRefreshToken || '';
}).set(function(val) {
  this.credentials = this.credentials || {};
  this.credentials.encryptedRefreshToken = val;
});

MarketplaceConnectionSchema.virtual('account').get(function() {
  return {
    sellerId: this.sellerId || this.sellerAccountId,
    storeName: this.accountName,
    shopDomain: this.shopDomain || this.storeUrl
  };
}).set(function(val) {
  if (val) {
    if (val.sellerId !== undefined) {
      this.sellerId = val.sellerId;
      this.sellerAccountId = val.sellerId;
    }
    if (val.storeName !== undefined) this.accountName = val.storeName;
    if (val.shopDomain !== undefined) {
      this.shopDomain = val.shopDomain;
      this.storeUrl = val.shopDomain;
    }
  }
});

MarketplaceConnectionSchema.virtual('health').get(function() {
  return {
    status: this.get('apiHealth.status') || 'unknown',
    lastCheckedAt: this.get('apiHealth.lastCheckedAt'),
    lastError: this.get('apiHealth.lastError')
  };
}).set(function(val) {
  if (val) {
    if (val.status !== undefined) this.set('apiHealth.status', val.status);
    if (val.lastCheckedAt !== undefined) this.set('apiHealth.lastCheckedAt', val.lastCheckedAt);
    if (val.lastError !== undefined) this.set('apiHealth.lastError', val.lastError);
  }
});

MarketplaceConnectionSchema.virtual('lastSuccessfulSync').get(function() {
  return this.lastSyncAt || null;
});

module.exports = mongoose.model('MarketplaceConnection', MarketplaceConnectionSchema);
