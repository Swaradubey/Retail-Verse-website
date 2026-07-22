const mongoose = require('mongoose');

const MarketplaceIntegrationLogSchema = new mongoose.Schema({
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  marketplace: {
    type: String,
    enum: ['amazon', 'flipkart', 'shopify'],
    required: true,
  },
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketplaceConnection',
  },
  operation: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  errorCode: {
    type: String,
  },
  sanitizedMetadata: {
    type: mongoose.Schema.Types.Mixed,
  },
}, { 
  timestamps: { createdAt: true, updatedAt: false }
});

module.exports = mongoose.model('MarketplaceIntegrationLog', MarketplaceIntegrationLogSchema);
