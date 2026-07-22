const mongoose = require('mongoose');

const MarketplaceConnectionSchema = new mongoose.Schema({
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // or Client, depending on the system's auth structure. Existing used User
    required: true,
  },
  marketplace: {
    type: String,
    enum: ['amazon', 'shopify', 'flipkart', 'FLIPKART'],
    required: true,
  },
  integrationMode: {
    type: String,
    enum: ['DIRECT_API', 'INTEGRATION_PARTNER'],
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
  status: {
    type: String,
    enum: [
      'configuration_missing',
      'disconnected',
      'connecting',
      'connected',
      'token_expired',
      'connection_error',
      'approval_required',
      'sync_paused'
    ],
    default: 'disconnected',
  },
  isSyncEnabled: {
    type: Boolean,
    default: false,
  },
  credentials: {
    encryptedAccessToken: { type: String },
    encryptedRefreshToken: { type: String },
    encryptedConsumerKey: { type: String },
    encryptedConsumerSecret: { type: String },
    iv: { type: String },
    authTag: { type: String }
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
  // Flipkart Integration fields
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
    enum: [
      'DISCONNECTED',
      'CONNECTING',
      'CONNECTED',
      'TOKEN_EXPIRING',
      'AUTHENTICATION_FAILED',
      'API_ACCESS_PENDING',
      'SYNCING',
      'PARTIAL_FAILURE',
      'REAUTH_REQUIRED',
      'ACCESS_PENDING',
      'RATE_LIMITED',
      'UNHEALTHY'
    ],
    default: 'DISCONNECTED'
  },
  apiHealthStatus: {
    type: String,
    enum: ['HEALTHY', 'TOKEN_EXPIRING', 'REAUTH_REQUIRED', 'ACCESS_PENDING', 'RATE_LIMITED', 'UNHEALTHY', 'UNKNOWN'],
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

// Add compound unique index
MarketplaceConnectionSchema.index({ merchantId: 1, marketplace: 1, sellerAccountId: 1 }, { unique: true, sparse: true });

// Retaining virtuals for backwards compatibility if some existing code still relies on it,
// though we aim to transition completely.
MarketplaceConnectionSchema.virtual('sellerId').get(function() {
  return this.sellerAccountId || '';
}).set(function(val) {
  this.sellerAccountId = val;
});

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
    sellerId: this.sellerAccountId,
    storeName: this.accountName,
    shopDomain: this.shopDomain || this.storeUrl
  };
}).set(function(val) {
  if (val) {
    if (val.sellerId !== undefined) this.sellerAccountId = val.sellerId;
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
