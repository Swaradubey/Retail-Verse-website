const mongoose = require("mongoose");

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const customLinkSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "/" },
    visible: { type: Boolean, default: true },
  },
  { _id: false }
);

const footerColumnLinkSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "/" },
  },
  { _id: false }
);

const footerColumnSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: "" },
    links: { type: [footerColumnLinkSchema], default: [] },
  },
  { _id: false }
);

const typographySchema = new mongoose.Schema(
  {
    fontFamily: {
      type: String,
      enum: ["Inter", "Roboto", "Poppins", "Plus Jakarta Sans", "Open Sans"],
      default: "Inter",
    },
    headingFont: { type: String, trim: true, default: "Inter" },
    baseFontSize: { type: String, enum: ["14px", "16px"], default: "16px" },
  },
  { _id: false }
);

const headerConfigSchema = new mongoose.Schema(
  {
    variant: {
      type: String,
      enum: ["standard", "minimal", "centered", "floating"],
      default: "standard",
    },
    backgroundColor: { type: String, trim: true, default: "#ffffff" },
    textColor: { type: String, trim: true, default: "#111827" },
    sticky: { type: Boolean, default: true },
    showSearchBar: { type: Boolean, default: true },
    showCategories: { type: Boolean, default: true },
    customLinks: { type: [customLinkSchema], default: [] },
  },
  { _id: false }
);

const footerConfigSchema = new mongoose.Schema(
  {
    variant: {
      type: String,
      enum: ["classic", "minimal", "multi-column"],
      default: "classic",
    },
    backgroundColor: { type: String, trim: true, default: "#0f172a" },
    textColor: { type: String, trim: true, default: "#f8fafc" },
    showNewsletter: { type: Boolean, default: true },
    showSocialLinks: { type: Boolean, default: true },
    copyrightText: {
      type: String,
      trim: true,
      default: `© ${new Date().getFullYear()} YourBrand. All rights reserved.`,
    },
    columns: { type: [footerColumnSchema], default: [] },
  },
  { _id: false }
);

// ── Root schema ───────────────────────────────────────────────────────────────

const themeLayoutSchema = new mongoose.Schema(
  {
    /** One ThemeLayout document per client (tenant). */
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      unique: true,
      index: true,
    },
    typography: { type: typographySchema, default: () => ({}) },
    headerConfig: { type: headerConfigSchema, default: () => ({}) },
    footerConfig: { type: footerConfigSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ThemeLayout", themeLayoutSchema);

