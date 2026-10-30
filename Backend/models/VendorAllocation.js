const mongoose = require('mongoose');

const VendorAllocationSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'vendorModel',
      required: true,
      index: true,
    },
    vendorModel: {
      type: String,
      enum: ['Vendor', 'User'],
      default: 'Vendor',
    },
    vendorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    allocatedQuantity: {
      type: Number,
      required: true,
      min: [1, 'Allocated quantity must be at least 1'],
    },
    currentStockAtTrigger: {
      type: Number,
      required: true,
    },
    targetDeliveryDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'DISPATCHED', 'RECEIVED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    // Read Receipt Fields
    isSeen: {
      type: Boolean,
      default: false,
      index: true,
    },
    seenAt: {
      type: Date,
      default: null,
    },
    vendorNotes: {
      type: String,
      default: '',
    },
    fulfilledQuantity: {
      type: Number,
      default: 0,
    },
    stockUpdatedToInventory: {
      type: Boolean,
      default: false,
    },
    stockUpdatedAt: {
      type: Date,
      default: null,
    },
    dispatchedAt: {
      type: Date,
      default: null,
    },
    receivedAt: {
      type: Date,
      default: null,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound indexes for fast vendor queries and admin lookup (High Performance & Scalability)
VendorAllocationSchema.index({ vendorId: 1, status: 1 });
VendorAllocationSchema.index({ vendorUserId: 1, status: 1 });
VendorAllocationSchema.index({ vendorId: 1, status: 1, isSeen: 1 });
VendorAllocationSchema.index({ productId: 1, createdAt: -1 });
VendorAllocationSchema.index({ clientId: 1, status: 1 });
VendorAllocationSchema.index({ adminId: 1, createdAt: -1 });

module.exports = mongoose.model('VendorAllocation', VendorAllocationSchema);
