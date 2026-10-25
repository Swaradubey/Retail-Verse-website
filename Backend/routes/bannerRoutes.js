const express = require("express");
const router = express.Router();
const {
  getActiveBanners,
  getAllBannersAdmin,
  createBanner,
  updateBanner,
  reorderBanners,
  deleteBanner,
} = require("../controllers/bannerController");
const { uploadBannerImages } = require("../config/bannerStorage");
const { optionalProtect } = require("../middleware/authMiddleware");

/**
 * Storefront Public Routes
 * GET /api/banners/active?placement=HOME_HERO
 */
router.get("/active", getActiveBanners);

/**
 * Dashboard & Admin Routes
 * GET    /api/banners/admin       - Fetch all banners (active and inactive)
 * POST   /api/banners             - Create banner with multipart image uploads
 * PUT    /api/banners/:id         - Update banner or replace images
 * PATCH  /api/banners/reorder     - Batch update order using { id, order } array
 * DELETE /api/banners/:id         - Permanently delete a banner
 */
router.get("/admin", optionalProtect, getAllBannersAdmin);
router.post("/", optionalProtect, uploadBannerImages, createBanner);
router.patch("/reorder", optionalProtect, reorderBanners);
router.put("/:id", optionalProtect, uploadBannerImages, updateBanner);
router.delete("/:id", optionalProtect, deleteBanner);

module.exports = router;
