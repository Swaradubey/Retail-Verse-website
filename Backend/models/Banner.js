const mongoose = require("mongoose");

/**
 * Banner Schema
 * Supports eBay-style dynamic promotional hero banners and placements
 */
const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: "",
    },
    badgeText: {
      type: String,
      trim: true,
      default: "",
    },
    headline: {
      type: String,
      required: [true, "Banner headline is required"],
      trim: true,
    },
    subheadline: {
      type: String,
      trim: true,
      default: "",
    },
    imageUrl: {
      type: String,
      required: [true, "Banner desktop image URL is required"],
      trim: true,
    },
    mobileImageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    ctaText: {
      type: String,
      trim: true,
      default: "Shop Now",
    },
    ctaLink: {
      type: String,
      required: [true, "Banner destination CTA link is required"],
      trim: true,
      default: "/shop",
    },
    backgroundColor: {
      type: String,
      trim: true,
      default: "#f7f7f7",
    },
    textColor: {
      type: String,
      trim: true,
      default: "#111827",
    },
    placement: {
      type: String,
      enum: ["HOME_HERO", "CATEGORY_TOP", "PROMO_STRIP"],
      default: "HOME_HERO",
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Fallback mobileImageUrl to desktop imageUrl if omitted
bannerSchema.pre("save", function (next) {
  if (!this.mobileImageUrl || this.mobileImageUrl.trim() === "") {
    this.mobileImageUrl = this.imageUrl;
  }
  next();
});

// High-performance composite indexes for lightning-fast queries (<10ms index scan)
bannerSchema.index({ placement: 1, isActive: 1, order: 1 });
bannerSchema.index({ isActive: 1, placement: 1, order: 1, createdAt: 1 });
bannerSchema.index({ isActive: 1, order: 1, createdAt: -1 });
bannerSchema.index({ placement: 1, order: -1 });
bannerSchema.index({ createdAt: -1 });

const Banner = mongoose.models.Banner || mongoose.model("Banner", bannerSchema);

module.exports = Banner;
