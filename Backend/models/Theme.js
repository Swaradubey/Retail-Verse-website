const mongoose = require("mongoose");

const themeSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    isEnabled: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    previewImage: { type: String, trim: true, default: "" },
    features: [{ type: String, trim: true }],
    layoutStyle: { type: String, trim: true, default: "" },
    typographyStyle: { type: String, trim: true, default: "" },
    colorPalette: {
      primary: { type: String, default: "" },
      secondary: { type: String, default: "" },
      accent: { type: String, default: "" },
      background: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Theme", themeSchema);
