const mongoose = require('mongoose');

const MarketplaceFieldMappingSchema = new mongoose.Schema({
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  marketplace: {
    type: String,
    required: true
  },
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketplaceConnection'
  },
  sourceField: {
    type: String,
    required: true
  },
  targetField: {
    type: String,
    required: true
  },
  transformType: {
    type: String,
    enum: ['direct', 'static', 'prefix', 'suffix', 'calculate', 'custom'],
    default: 'direct'
  },
  defaultValue: {
    type: String
  },
  isRequired: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

MarketplaceFieldMappingSchema.index({ merchantId: 1, marketplace: 1 });

module.exports = mongoose.model('MarketplaceFieldMapping', MarketplaceFieldMappingSchema);
