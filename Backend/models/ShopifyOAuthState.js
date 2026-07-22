const mongoose = require('mongoose');

const shopifyOAuthStateSchema = new mongoose.Schema({
  state: {
    type: String,
    required: true,
    unique: true,
  },
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  shopDomain: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  used: {
    type: Boolean,
    default: false,
  }
}, {
  timestamps: true,
  collection: 'shopify_oauth_states'
});

// TTL index to expire records automatically at expiresAt time
shopifyOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.ShopifyOAuthState || mongoose.model('ShopifyOAuthState', shopifyOAuthStateSchema);
