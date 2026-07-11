const express = require("express");
const router = express.Router();
const { protect, allowRoles } = require("../middleware/authMiddleware");
const {
  getAllThemes,
  getThemeUsage,
  setDefaultTheme,
  toggleTheme,
  assignThemeToClient,
  resetClientTheme,
  getClientAssignments,
  getAvailableThemes,
  getMyTheme,
  updateMyTheme,
  resetMyTheme,
  resolveStorefrontTheme,
  seedThemes,
} = require("../controllers/themeController");

// ── Super Admin routes ──────────────────────────────────────────────────────────
router.get("/", protect, allowRoles("super_admin"), getAllThemes);
router.get("/usage", protect, allowRoles("super_admin"), getThemeUsage);
router.put("/default", protect, allowRoles("super_admin"), setDefaultTheme);
router.put("/:themeKey/toggle", protect, allowRoles("super_admin"), toggleTheme);
router.put("/assign/:clientId", protect, allowRoles("super_admin"), assignThemeToClient);
router.put("/reset/:clientId", protect, allowRoles("super_admin"), resetClientTheme);
router.get("/client-assignments", protect, allowRoles("super_admin"), getClientAssignments);

// ── Client routes ───────────────────────────────────────────────────────────────
router.get("/available", protect, allowRoles("client", "client_admin"), getAvailableThemes);
router.get("/my-theme", protect, allowRoles("client", "client_admin"), getMyTheme);
router.put("/my-theme", protect, allowRoles("client", "client_admin"), updateMyTheme);
router.put("/my-theme/reset", protect, allowRoles("client", "client_admin"), resetMyTheme);

// ── Public route ────────────────────────────────────────────────────────────────
router.get("/storefront/:clientId", resolveStorefrontTheme);

// ── Seed route (Super Admin only) ──────────────────────────────────────────────
router.post("/seed", protect, allowRoles("super_admin"), seedThemes);

module.exports = router;
