const express = require("express");
const router = express.Router();
const { protect, allowRoles, optionalProtect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");
const {
  createOrder,
  checkoutOrder,
  getOrders,
  getLatestTransactions,
  getOrderById,
  deleteOrder,
  getMyOrdersTracking,
  getUserDashboardOverview,
  getOrderTrackingByIdentifier,
  patchOrderTracking,
  patchOrderTrackingStatus,
  cancelOrder,
} = require("../controllers/orderController");

// @route   POST /api/orders/checkout (POS barcode checkout with session/transaction)
router.post("/checkout", optionalProtect, tenantMiddleware, checkoutOrder);

// @route   POST /api/orders (optional JWT — links order to logged-in customer when token present)
router.post("/", optionalProtect, tenantMiddleware, createOrder);

// @route   GET /api/orders/my-tracking (logged-in customer — own orders + tracking)
router.get(
  "/my-tracking",
  protect,
  allowRoles("user", "customer", "admin", "super_admin", "staff", "inventory_manager", "cashier", "client_admin"),
  tenantMiddleware,
  getMyOrdersTracking
);

// @route   GET /api/orders/me/dashboard-overview (storefront user — active orders + conversion KPIs)
router.get(
  "/me/dashboard-overview",
  protect,
  allowRoles("user", "customer"),
  tenantMiddleware,
  getUserDashboardOverview
);

// @route   GET /api/orders/track?query=... (same lookup as :identifier — query param for search UX)
router.get(
  "/track",
  protect,
  allowRoles("user", "customer", "admin", "super_admin", "staff", "inventory_manager", "cashier", "client_admin"),
  tenantMiddleware,
  getOrderTrackingByIdentifier
);

// @route   GET /api/orders/track/:identifier (logged-in customer — by orderId, trackingId, AWB, Shiprocket ids, Mongo id)
router.get(
  "/track/:identifier",
  protect,
  allowRoles("user", "customer", "admin", "super_admin", "staff", "inventory_manager", "cashier", "client_admin"),
  tenantMiddleware,
  getOrderTrackingByIdentifier
);

// @route   GET /api/orders (dashboard — admin/staff only; customers see own orders)
router.get("/", protect, allowRoles("super_admin", "admin", "client", "staff", "inventory_manager", "cashier", "client_admin", "user", "customer"), tenantMiddleware, getOrders);

// @route   GET /api/orders/dashboard/latest-transactions (must be before /:id)
router.get(
  "/dashboard/latest-transactions",
  protect,
  allowRoles("super_admin", "admin", "client", "staff", "inventory_manager", "cashier", "client_admin", "user", "customer"),
  tenantMiddleware,
  getLatestTransactions
);

// @route   PATCH /api/orders/:orderId/tracking-status (admin — sequential tracking updates)
router.patch(
  "/:orderId/tracking-status",
  protect,
  allowRoles("super_admin", "admin", "client", "staff", "inventory_manager", "cashier", "client_admin"),
  tenantMiddleware,
  patchOrderTrackingStatus
);

// @route   PATCH /api/orders/:id/tracking (admin/staff — update shipment / timeline)
router.patch(
  "/:id/tracking",
  protect,
  allowRoles("super_admin", "admin", "client", "staff", "inventory_manager", "cashier", "client_admin"),
  tenantMiddleware,
  patchOrderTracking
);

// @route   PATCH /api/orders/:orderId/cancel (logged-in customer — own orders; admin/super_admin — any eligible order)
router.patch(
  "/:orderId/cancel",
  protect,
  allowRoles("user", "customer", "admin", "super_admin", "client_admin"),
  tenantMiddleware,
  cancelOrder
);

// @route   GET /api/orders/:id (public for order confirmation by id)
router.get("/:id", tenantMiddleware, getOrderById);

// @route   DELETE /api/orders/:id
router.delete("/:id", protect, allowRoles("super_admin", "admin", "client", "client_admin"), tenantMiddleware, deleteOrder);

module.exports = router;
