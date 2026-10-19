const mongoose = require('mongoose');

const ProductMappingSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    inventoryProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true
    },
    marketplace: {
      type: String,
      required: true,
      enum: ['flipkart', 'amazon', 'meesho', 'swiggy', 'myntra', 'shopify'],
      index: true
    },
    externalProductId: {
      type: String,
      default: ''
    },
    syncStatus: {
      type: String,
      enum: ['PENDING', 'SYNCED', 'FAILED'],
      default: 'PENDING',
      index: true
    },
    lastError: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Prevent duplicate mapping for same client, product, and marketplace
ProductMappingSchema.index(
  { clientId: 1, inventoryProductId: 1, marketplace: 1 },
  { unique: true }
);

module.exports = mongoose.model('ProductMapping', ProductMappingSchema);
