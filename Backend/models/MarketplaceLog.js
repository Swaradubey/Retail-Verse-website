const mongoose = require('mongoose');

const MarketplaceLogSchema = new mongoose.Schema({
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketplaceConnection',
    required: true,
  },
  marketplace: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['sync', 'health_check', 'auth', 'webhook', 'system'],
    required: true,
  },
  level: {
    type: String,
    enum: ['info', 'warning', 'error', 'critical'],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  statusCode: {
    type: Number,
  },
  endpoint: {
    type: String,
  },
  retryCount: {
    type: Number,
    default: 0,
  },
  resolved: {
    type: Boolean,
    default: false,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
}, { timestamps: true });

module.exports = mongoose.model('MarketplaceLog', MarketplaceLogSchema);
