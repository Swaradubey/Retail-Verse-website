const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Coupon code is required"],
      uppercase: true,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      default: "Flat ₹500 off on orders of ₹3,000 or more",
    },
    discountAmount: {
      type: Number,
      required: true,
      default: 500,
      min: [0, "Discount amount cannot be negative"],
    },
    minOrderSubtotal: {
      type: Number,
      required: true,
      default: 3000,
      min: [0, "Minimum order subtotal cannot be negative"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Coupon", couponSchema);
