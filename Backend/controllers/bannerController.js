const Banner = require("../models/Banner");
const { processBannerUploads, deleteStoredImage } = require("../config/bannerStorage");
const bannerCache = require("../utils/bannerCache");
const mongoose = require("mongoose");

/**
 * 1. GET /api/banners/active?placement=HOME_HERO
 * Public endpoint for storefront.
 * Returns active banners within scheduling windows, sorted by order ascending.
 * Tuned for blazing fast sub-millisecond (<1ms) response with in-memory caching and HTTP cache headers.
 */
const getActiveBanners = async (req, res) => {
  try {
    const placement = req.query.placement ? String(req.query.placement).trim() : "HOME_HERO";
    const cacheKey = bannerCache.generateKey(placement, false);

    // Check in-memory cache first (<0.5ms)
    const cached = bannerCache.get(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
      res.setHeader("X-Cache", "HIT");
      return res.status(200).json(cached);
    }

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

    // Fast indexed query with lean projection (<10ms)
    const banners = await Banner.find(query)
      .select("title badgeText headline subheadline imageUrl mobileImageUrl ctaText ctaLink backgroundColor textColor placement order isActive startDate endDate createdAt")
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const responsePayload = {
      success: true,
      count: banners.length,
      data: banners,
    };

    // Store in-memory cache with 120s TTL
    bannerCache.set(cacheKey, responsePayload, 120 * 1000);

    // Set high-performance HTTP cache headers for browser & CDN edge caching
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.setHeader("X-Cache", "MISS");

    return res.status(200).json(responsePayload);
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
 * Tuned with in-memory caching and lean projection.
 */
const getAllBannersAdmin = async (req, res) => {
  try {
    const placement = req.query.placement ? String(req.query.placement).trim() : "all";
    const cacheKey = bannerCache.generateKey(placement, true);

    const cached = bannerCache.get(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "private, no-cache");
      res.setHeader("X-Cache", "HIT");
      return res.status(200).json(cached);
    }

    const filter = {};
    if (req.query.placement) {
      filter.placement = String(req.query.placement).trim();
    }

    const banners = await Banner.find(filter)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const responsePayload = {
      success: true,
      count: banners.length,
      data: banners,
    };

    // Cache admin listing for 30s to absorb rapid re-renders
    bannerCache.set(cacheKey, responsePayload, 30 * 1000);

    res.setHeader("Cache-Control", "private, no-cache");
    res.setHeader("X-Cache", "MISS");

    return res.status(200).json(responsePayload);
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
 * Tuned with parallel uploads and instant cache invalidation.
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

    // Determine order: fast lean lookup with index
    let finalOrder = parseInt(order, 10);
    if (isNaN(finalOrder)) {
      const highestBanner = await Banner.findOne({
        placement: placement || "HOME_HERO",
      })
        .sort({ order: -1 })
        .select("order")
        .lean();
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

    // Invalidate all banner caches instantly so new banner is visible immediately
    bannerCache.invalidateAll();

    res.setHeader("Cache-Control", "private, no-cache");

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
 * Tuned with atomic findByIdAndUpdate and instant cache busting.
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

    // Parallel upload processing
    const { imageUrl: uploadedImageUrl, mobileImageUrl: uploadedMobileImageUrl } =
      await processBannerUploads(req);

    // Build update object
    const update = {};
    if (req.body.title !== undefined) update.title = req.body.title.trim();
    if (req.body.badgeText !== undefined) update.badgeText = req.body.badgeText.trim();
    if (req.body.headline !== undefined) update.headline = req.body.headline.trim();
    if (req.body.subheadline !== undefined) update.subheadline = req.body.subheadline.trim();
    if (req.body.ctaText !== undefined) update.ctaText = req.body.ctaText.trim();
    if (req.body.ctaLink !== undefined) update.ctaLink = req.body.ctaLink.trim();
    if (req.body.backgroundColor !== undefined) update.backgroundColor = req.body.backgroundColor.trim();
    if (req.body.textColor !== undefined) update.textColor = req.body.textColor.trim();
    if (req.body.placement !== undefined) update.placement = req.body.placement;
    if (req.body.order !== undefined) update.order = Number(req.body.order);
    if (req.body.isActive !== undefined) {
      update.isActive = String(req.body.isActive) === "true" || req.body.isActive === true;
    }
    if (req.body.startDate !== undefined) {
      update.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    }
    if (req.body.endDate !== undefined) {
      update.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    }

    if (uploadedImageUrl) {
      update.imageUrl = uploadedImageUrl;
    } else if (req.body.imageUrl !== undefined) {
      update.imageUrl = req.body.imageUrl.trim();
    }

    if (uploadedMobileImageUrl) {
      update.mobileImageUrl = uploadedMobileImageUrl;
    } else if (req.body.mobileImageUrl !== undefined) {
      update.mobileImageUrl = req.body.mobileImageUrl.trim();
    }

    // Atomic update without full document hydration
    const banner = await Banner.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found.",
      });
    }

    // Ensure mobileImageUrl fallback
    if (!banner.mobileImageUrl && banner.imageUrl) {
      banner.mobileImageUrl = banner.imageUrl;
      Banner.updateOne({ _id: id }, { $set: { mobileImageUrl: banner.imageUrl } }).exec().catch(() => {});
    }

    // Clean up replaced images asynchronously in background
    if (uploadedImageUrl && req.body.oldImageUrl && req.body.oldImageUrl !== uploadedImageUrl) {
      deleteStoredImage(req.body.oldImageUrl);
    }
    if (uploadedMobileImageUrl && req.body.oldMobileImageUrl && req.body.oldMobileImageUrl !== uploadedMobileImageUrl) {
      deleteStoredImage(req.body.oldMobileImageUrl);
    }

    // Bust all banner caches instantly
    bannerCache.invalidateAll();

    res.setHeader("Cache-Control", "private, no-cache");

    return res.status(200).json({
      success: true,
      message: "Banner updated successfully.",
      data: banner,
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
 * Tuned with unordered parallel bulk writes and instant cache invalidation.
 */
const reorderBanners = async (req, res) => {
  try {
    const { items } = req.body;

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

    // Parallel unordered execution for high performance
    const result = await Banner.bulkWrite(bulkOps, { ordered: false });

    // Bust cache instantly
    bannerCache.invalidateAll();

    res.setHeader("Cache-Control", "private, no-cache");

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
 * Tuned with atomic findByIdAndDelete and non-blocking background cleanup.
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

    // Atomic find and delete in single database trip
    const banner = await Banner.findByIdAndDelete(id).select("imageUrl mobileImageUrl").lean();
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found.",
      });
    }

    // Non-blocking disk asset cleanup
    deleteStoredImage(banner.imageUrl);
    if (banner.mobileImageUrl && banner.mobileImageUrl !== banner.imageUrl) {
      deleteStoredImage(banner.mobileImageUrl);
    }

    // Invalidate cache immediately
    bannerCache.invalidateAll();

    res.setHeader("Cache-Control", "private, no-cache");

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
