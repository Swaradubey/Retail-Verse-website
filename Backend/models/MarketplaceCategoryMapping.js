const mongoose = require('mongoose');

const MarketplaceCategoryMappingSchema = new mongoose.Schema({
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  marketplace: {
    type: String,
    required: true
  },
  retailVerseCategoryId: {
    type: String, // String to support either ObjectId or textual category names depending on implementation
    required: true
  },
  marketplaceCategoryId: {
    type: String,
    required: true
  },
  marketplaceCategoryName: {
    type: String
  },
  requiredAttributes: [{
    type: String
  }],
  optionalAttributes: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

MarketplaceCategoryMappingSchema.index({ merchantId: 1, marketplace: 1, retailVerseCategoryId: 1 }, { unique: true });

module.exports = mongoose.model('MarketplaceCategoryMapping', MarketplaceCategoryMappingSchema);
