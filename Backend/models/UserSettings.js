const mongoose = require("mongoose");

const userSettingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    storeName: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    currency: { type: String, default: "INR" },
    notifications: { type: Boolean, default: true },
    security2FA: { type: Boolean, default: false },
    logoUrl: { type: String, default: null },
  },
  { timestamps: true, collection: "settings" }
);

module.exports =
  mongoose.models.UserSettings || mongoose.model("UserSettings", userSettingsSchema);
