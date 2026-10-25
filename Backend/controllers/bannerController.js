const Banner = require("../models/Banner");
const { processBannerUploads, deleteStoredImage } = require("../config/bannerStorage");
const mongoose = require("mongoose");

/**
 * 1. GET /api/banners/active?placement=HOME_HERO
 * Public endpoint for storefront.
 * Returns active banners within scheduling windows, sorted by order ascending.
 */
const getActiveBanners = async (req, res) => {
  try {
    const placement = req.query.placement ? String(req.query.placement).trim() : "HOME_HERO";
    const now = new Date();

    const query = {
      placement,
      isActive: true,
      $and: [
        {
          $or: [
            { startDate: null },
            { startDate: { $exists: false } },
            { startDate: { $lte: now } },
          ],
        },
        {
          $or: [
            { endDate: null },
            { endDate: { $exists: false } },
            { endDate: { $gte: now } },
          ],
        },
      ],
    };

    const banners = await Banner.find(query)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: banners.length,
      data: banners,
    });
  } catch (error) {
    console.error("[BannerController] getActiveBanners error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve active promotional banners.",
      error: error.message,
    });
  }
};

/**
 * 2. GET /api/banners/admin
 * Fetches all banners (active and inactive) sorted by order ascending for dashboards.
 */
const getAllBannersAdmin = async (req, res) => {
  try {
    const filter = {};
    if (req.query.placement) {
      filter.placement = String(req.query.placement).trim();
    }

    const banners = await Banner.find(filter)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: banners.length,
      data: banners,
    });
  } catch (error) {
    console.error("[BannerController] getAllBannersAdmin error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve banner administration list.",
      error: error.message,
    });
  }
};

/**
 * 3. POST /api/banners
 * Create a new promotional banner with optional file uploads.
 */
const createBanner = async (req, res) => {
  try {
    const { imageUrl: uploadedImageUrl, mobileImageUrl: uploadedMobileImageUrl } =
      await processBannerUploads(req);

    const {
      title,
      badgeText,
      headline,
      subheadline,
      ctaText,
      ctaLink,
      backgroundColor,
      textColor,
      placement,
      order,
      isActive,
      startDate,
      endDate,
    } = req.body;

    // Validation
    const cleanHeadline = (headline || "").trim();
    const finalImageUrl = (uploadedImageUrl || req.body.imageUrl || "").trim();
    const cleanCtaLink = (ctaLink || "").trim();

    if (!cleanHeadline) {
      return res.status(400).json({
        success: false,
        message: "Headline is required for promotional banners.",
      });
    }

    if (!finalImageUrl) {
      return res.status(400).json({
        success: false,
        message: "Desktop artwork image is required (upload file or provide imageUrl).",
      });
    }

    if (!cleanCtaLink) {
      return res.status(400).json({
        success: false,
        message: "Destination CTA link is required.",
      });
    }

    // Determine order: if not provided or 0, default to next highest order
    let finalOrder = parseInt(order, 10);
    if (isNaN(finalOrder)) {
      const highestBanner = await Banner.findOne({
        placement: placement || "HOME_HERO",
      }).sort({ order: -1 }).select("order");
      finalOrder = highestBanner ? highestBanner.order + 1 : 0;
    }

    const banner = new Banner({
      title: (title || "").trim(),
      badgeText: (badgeText || "").trim(),
      headline: cleanHeadline,
      subheadline: (subheadline || "").trim(),
      imageUrl: finalImageUrl,
      mobileImageUrl: (uploadedMobileImageUrl || req.body.mobileImageUrl || finalImageUrl).trim(),
      ctaText: (ctaText || "Shop Now").trim(),
      ctaLink: cleanCtaLink,
      backgroundColor: (backgroundColor || "#f7f7f7").trim(),
      textColor: (textColor || "#111827").trim(),
      placement: placement || "HOME_HERO",
      order: finalOrder,
      isActive: isActive === undefined ? true : String(isActive) === "true" || isActive === true,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    });

    const saved = await banner.save();

    return res.status(201).json({
      success: true,
      message: "Promotional banner created successfully.",
      data: saved,
    });
  } catch (error) {
    console.error("[BannerController] createBanner error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create banner.",
      error: error.message,
    });
  }
};

/**
 * 4. PUT /api/banners/:id
 * Update banner fields, status toggle (isActive), or replace banner artwork.
 */
const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid banner identifier.",
      });
    }

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found.",
      });
    }

    const { imageUrl: uploadedImageUrl, mobileImageUrl: uploadedMobileImageUrl } =
      await processBannerUploads(req);

    // If new images were uploaded, clean up old disk assets
    if (uploadedImageUrl && banner.imageUrl && banner.imageUrl !== uploadedImageUrl) {
      deleteStoredImage(banner.imageUrl);
      banner.imageUrl = uploadedImageUrl;
    } else if (req.body.imageUrl !== undefined) {
      banner.imageUrl = req.body.imageUrl.trim();
    }

    if (uploadedMobileImageUrl && banner.mobileImageUrl && banner.mobileImageUrl !== uploadedMobileImageUrl) {
      deleteStoredImage(banner.mobileImageUrl);
      banner.mobileImageUrl = uploadedMobileImageUrl;
    } else if (req.body.mobileImageUrl !== undefined) {
      banner.mobileImageUrl = req.body.mobileImageUrl.trim();
    }

    // Update optional and required text fields
    if (req.body.title !== undefined) banner.title = req.body.title.trim();
    if (req.body.badgeText !== undefined) banner.badgeText = req.body.badgeText.trim();
    if (req.body.headline !== undefined) banner.headline = req.body.headline.trim();
    if (req.body.subheadline !== undefined) banner.subheadline = req.body.subheadline.trim();
    if (req.body.ctaText !== undefined) banner.ctaText = req.body.ctaText.trim();
    if (req.body.ctaLink !== undefined) banner.ctaLink = req.body.ctaLink.trim();
    if (req.body.backgroundColor !== undefined) banner.backgroundColor = req.body.backgroundColor.trim();
    if (req.body.textColor !== undefined) banner.textColor = req.body.textColor.trim();
    if (req.body.placement !== undefined) banner.placement = req.body.placement;
    if (req.body.order !== undefined) banner.order = Number(req.body.order);
    if (req.body.isActive !== undefined) {
      banner.isActive = String(req.body.isActive) === "true" || req.body.isActive === true;
    }
    if (req.body.startDate !== undefined) {
      banner.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    }
    if (req.body.endDate !== undefined) {
      banner.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    }

    // Ensure mobileImageUrl falls back to imageUrl
    if (!banner.mobileImageUrl) {
      banner.mobileImageUrl = banner.imageUrl;
    }

    const updated = await banner.save();

    return res.status(200).json({
      success: true,
      message: "Banner updated successfully.",
      data: updated,
    });
  } catch (error) {
    console.error("[BannerController] updateBanner error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update banner.",
      error: error.message,
    });
  }
};

/**
 * 5. PATCH /api/banners/reorder
 * Batch reordering using array of { id, order } via Banner.bulkWrite()
 */
const reorderBanners = async (req, res) => {
  try {
    const { items } = req.body; // Expects array: [{ id: "...", order: 0 }, ...]

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Expected a non-empty 'items' array containing { id, order }.",
      });
    }

    const bulkOps = items
      .filter((item) => item && (item.id || item._id) && typeof item.order === "number")
      .map((item) => {
        const id = item.id || item._id;
        return {
          updateOne: {
            filter: { _id: id },
            update: { $set: { order: item.order } },
          },
        };
      });

    if (bulkOps.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid order updates provided.",
      });
    }

    const result = await Banner.bulkWrite(bulkOps);

    return res.status(200).json({
      success: true,
      message: "Banners reordered successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("[BannerController] reorderBanners error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reorder banners.",
      error: error.message,
    });
  }
};

/**
 * 6. DELETE /api/banners/:id
 * Permanently delete a banner and its stored images.
 */
const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid banner identifier.",
      });
    }

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found.",
      });
    }

    // Clean up local disk files if applicable
    deleteStoredImage(banner.imageUrl);
    if (banner.mobileImageUrl && banner.mobileImageUrl !== banner.imageUrl) {
      deleteStoredImage(banner.mobileImageUrl);
    }

    await Banner.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Banner permanently deleted.",
      deletedId: id,
    });
  } catch (error) {
    console.error("[BannerController] deleteBanner error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete banner.",
      error: error.message,
    });
  }
};

module.exports = {
  getActiveBanners,
  getAllBannersAdmin,
  createBanner,
  updateBanner,
  reorderBanners,
  deleteBanner,
};
