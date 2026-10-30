const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    orderId: {
      type: String,
      required: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    customerEmail: {
      type: String,
      lowercase: true,
    },
    items: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        subtotal: { type: Number, required: true },
        gstRate: { type: Number, default: 0 },
        gstAmount: { type: Number, default: 0 },
      },
    ],
    subtotal: {
      type: Number,
      required: true,
    },
    tax: {
      type: Number,
      default: 0,
    },
    cgst: {
      type: Number,
      default: 0,
    },
    sgst: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
    },
    paymentStatus: {
      type: String,
      default: "completed",
    },
    razorpayOrderId: {
      type: String,
    },
    razorpayPaymentId: {
      type: String,
    },
    paidAt: {
      type: Date,
    },
    orderStatus: {
      type: String,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    status: {
      type: String,
      default: "active",
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// High-performance covered compound indexes for tenant, status, search, and aggregation
invoiceSchema.index({ clientId: 1, createdAt: -1 });
invoiceSchema.index({ clientId: 1, isDeleted: 1, createdAt: -1 });
invoiceSchema.index({ clientId: 1, isDeleted: 1, invoiceDate: -1, status: 1 });
invoiceSchema.index({ clientId: 1, isDeleted: 1, paymentStatus: 1, createdAt: -1 });
invoiceSchema.index({ clientId: 1, paymentStatus: 1, createdAt: -1 });
invoiceSchema.index({ clientId: 1, totalAmount: 1 });
invoiceSchema.index({ orderId: 1, isDeleted: 1 });
invoiceSchema.index({ orderId: 1 });
invoiceSchema.index({ customerEmail: 1, createdAt: -1 });
invoiceSchema.index({ customerName: 1, createdAt: -1 });
invoiceSchema.index({ paymentStatus: 1, createdAt: -1 });
invoiceSchema.index({ isDeleted: 1, createdAt: -1 });
invoiceSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Invoice", invoiceSchema);
