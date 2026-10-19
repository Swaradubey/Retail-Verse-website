const mongoose = require("mongoose");

const inventoryLedgerSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product ID is required"],
      index: true,
    },
    barcode: {
      type: String,
      required: [true, "Barcode is required"],
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["PURCHASE", "SALE", "ADJUSTMENT"],
      required: [true, "Transaction type is required"],
    },
    quantityChanged: {
      type: Number,
      required: [true, "Quantity changed is required"],
    },
    remainingStock: {
      type: Number,
      required: [true, "Remaining stock is required"],
    },
    referenceOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

inventoryLedgerSchema.index({ productId: 1, createdAt: -1 });
inventoryLedgerSchema.index({ barcode: 1, createdAt: -1 });

module.exports = mongoose.model("InventoryLedger", inventoryLedgerSchema);
