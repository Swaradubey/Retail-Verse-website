const mongoose = require("mongoose");

const clientRazorpayConfigSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      unique: true,
      index: true,
    },
    razorpayEnabled: {
      type: Boolean,
      default: false,
    },
    razorpayKeyId: {
      type: String,
      trim: true,
      default: "",
    },
    razorpayKeySecretEncrypted: {
      type: String,
      default: "",
    },
    webhookSecretEncrypted: {
      type: String,
      default: "",
    },
    isConnected: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClientRazorpayConfig", clientRazorpayConfigSchema);
