const mongoose = require('mongoose');

const VendorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Vendor name is required'],
      trim: true,
      index: true,
    },
    companyName: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: String,
      trim: true,
      default: 'General Supplies',
    },
    contactPerson: {
      type: String,
      trim: true,
      default: '',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound indexes for high performance lookups
VendorSchema.index({ clientId: 1, isActive: 1 });
VendorSchema.index({ email: 1, clientId: 1 });

module.exports = mongoose.model('Vendor', VendorSchema);

