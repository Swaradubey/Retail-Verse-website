const mongoose = require("mongoose");

const quoteSchema = new mongoose.Schema(
  {
    quoteNumber: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
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
    products: [
      {
        productId: { type: String },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true }, // Original price at time of quote
      },
    ],
    originalTotal: {
      type: Number,
      required: true,
    },
    requestedPrice: {
      type: Number,
      required: true,
    },
    counterPrice: {
      type: Number,
    },
    finalPrice: {
      type: Number,
    },
    message: {
      type: String,
    },
    adminMessage: {
      type: String,
    },
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "countered", "accepted", "rejected", "deleted"],
    },
    paymentStatus: {
      type: String,
      default: "pending",
      enum: ["pending", "paid", "failed"],
    },
    razorpayOrderId: {
      type: String,
    },
    razorpayPaymentId: {
      type: String,
    },
    razorpaySignature: {
      type: String,
    },
    paidAt: {
      type: Date,
    },
    validUntil: {
      type: Date,
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

// High-performance covered compound indexes for tenant, status, user, search, and aggregation
quoteSchema.index({ clientId: 1, createdAt: -1 });
quoteSchema.index({ clientId: 1, isDeleted: 1, createdAt: -1 });
quoteSchema.index({ clientId: 1, isDeleted: 1, status: 1, createdAt: -1 });
quoteSchema.index({ clientId: 1, isDeleted: 1, paymentStatus: 1, createdAt: -1 });
quoteSchema.index({ clientId: 1, status: 1, createdAt: -1 });
quoteSchema.index({ clientId: 1, paymentStatus: 1, createdAt: -1 });
quoteSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });
quoteSchema.index({ userId: 1, createdAt: -1 });
quoteSchema.index({ status: 1, createdAt: -1 });
quoteSchema.index({ paymentStatus: 1, createdAt: -1 });
quoteSchema.index({ customerEmail: 1, createdAt: -1 });
quoteSchema.index({ customerName: 1, createdAt: -1 });
quoteSchema.index({ isDeleted: 1, createdAt: -1 });
quoteSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Quote", quoteSchema);

