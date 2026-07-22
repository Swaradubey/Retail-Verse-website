const mongoose = require('mongoose');

const flipkartOAuthStateSchema = new mongoose.Schema({
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
  accountLabel: {
    type: String,
    default: ''
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
  collection: 'flipkart_oauth_states'
});

// TTL index to expire records automatically
flipkartOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.FlipkartOAuthState || mongoose.model('FlipkartOAuthState', flipkartOAuthStateSchema);
