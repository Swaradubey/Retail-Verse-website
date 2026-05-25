const express = require("express");
const router = express.Router();
const { protect, allowRoles } = require("../middleware/authMiddleware");
const { getAdminWishlists } = require("../controllers/wishlistController");
const {
  getContacts,
  getContactById,
  updateContactStatus,
  deleteContact,
} = require("../controllers/contactController");
const {
  getCustomerSummary,
  getCustomers,
  getCustomerById,
} = require("../controllers/adminCustomerController");
const { getAdminAnalytics } = require("../controllers/adminAnalyticsController");

// @route   GET /api/admin/wishlists?sort=latest
router.get("/wishlists", protect, allowRoles("super_admin", "admin"), getAdminWishlists);

// Customer directory & aggregates
// @route   GET /api/admin/customers/summary
// @route   GET /api/admin/customers?page=&limit=&search=&status=
// @route   GET /api/admin/customers/:id
router.get("/customers/summary", protect, allowRoles("super_admin", "admin", "client", "store_manager"), getCustomerSummary);
router.get("/customers", protect, allowRoles("super_admin", "admin", "client", "store_manager"), getCustomers);
router.get("/customers/:id", protect, allowRoles("super_admin", "admin", "client", "store_manager"), getCustomerById);

// @route   GET /api/admin/analytics
router.get(
  "/analytics",
  protect,
  allowRoles("super_admin", "admin", "client", "store_manager", "staff", "inventory_manager", "cashier"),
  getAdminAnalytics
);

// Contact form submissions (website contact page) — same handlers as /api/contact, admin namespace only
// @route   GET /api/admin/contact-messages
// @route   GET /api/admin/contact-messages/:id
// @route   PATCH /api/admin/contact-messages/:id/status
// @route   DELETE /api/admin/contact-messages/:id (admin only)
router.get(
  "/contact-messages",
  protect,
  allowRoles("super_admin", "admin", "client", "store_manager", "client_admin"),
  getContacts
);
router.get(
  "/contact-messages/:id",
  protect,
  allowRoles("super_admin", "admin", "client", "store_manager", "client_admin"),
  getContactById
);
router.patch(
  "/contact-messages/:id/status",
  protect,
  allowRoles("super_admin", "admin", "client", "store_manager", "client_admin"),
  updateContactStatus
);
router.delete(
  "/contact-messages/:id",
  protect,
  allowRoles("super_admin", "admin", "client", "store_manager", "client_admin"),
  deleteContact
);

module.exports = router;
