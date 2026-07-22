const mongoose = require('mongoose');

const MarketplaceLocationSchema = new mongoose.Schema({
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketplaceConnection',
    required: true
  },
  shopDomain: {
    type: String,
    required: true
  },
  localWarehouseId: {
    type: String,
    default: null
  },
  shopifyLocationId: {
    type: String,
    required: true
  },
  locationName: {
    type: String,
    required: true
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

MarketplaceLocationSchema.index({ connectionId: 1, shopifyLocationId: 1 }, { unique: true });

module.exports = mongoose.model('MarketplaceLocation', MarketplaceLocationSchema);
