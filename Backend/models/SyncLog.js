const mongoose = require('mongoose');

const SyncLogSchema = new mongoose.Schema({
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
  marketplace: {
    type: String,
    required: true
  },
  operation: {
    type: String,
    enum: ['create', 'update', 'delete', 'pricing', 'inventory'],
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    required: true
  },
  request: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  response: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

SyncLogSchema.index({ productId: 1 });
SyncLogSchema.index({ merchantId: 1 });

module.exports = mongoose.model('SyncLog', SyncLogSchema);
