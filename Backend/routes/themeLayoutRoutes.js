const express = require("express");
const router = express.Router();
const { protect, allowRoles } = require("../middleware/authMiddleware");
const {
  getThemeLayout,
  updateThemeLayout,
  updateTypography,
  updateHeaderConfig,
  updateFooterConfig,
  resetThemeLayout,
  getPublicThemeLayout,
} = require("../controllers/themeLayoutController");

// ── Allowed roles for private (admin dashboard) routes ────────────────────────
const LAYOUT_ROLES = ["client", "client_admin", "admin", "super_admin"];

// ── Public storefront endpoint (no auth) ─────────────────────────────────────
router.get("/public/:clientId", getPublicThemeLayout);

// ── Authenticated endpoints ───────────────────────────────────────────────────
router.get("/", protect, allowRoles(...LAYOUT_ROLES), getThemeLayout);

// Full upsert (all three sections in one payload)
router.put("/", protect, allowRoles(...LAYOUT_ROLES), updateThemeLayout);

// Granular per-section updates
router.put("/typography", protect, allowRoles(...LAYOUT_ROLES), updateTypography);
router.put("/header", protect, allowRoles(...LAYOUT_ROLES), updateHeaderConfig);
router.put("/footer", protect, allowRoles(...LAYOUT_ROLES), updateFooterConfig);

// Reset to defaults
router.delete("/reset", protect, allowRoles(...LAYOUT_ROLES), resetThemeLayout);

module.exports = router;

